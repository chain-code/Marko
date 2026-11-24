// 块上不在文字里的东西，用装饰画出来，DOM 同 Typora 导出的 HTML（主题的 `li > input`、`.md-alert > p` 这类规则才对得上）：
// - 任务列表项的复选框（B-5）：列表项开头的 <input type="checkbox">，单击切换（按源码只改 `[ ]` 里那一个字符）；
// - Callout 的标题（B-13）：第一段开头的「图标 + 名称」和换行；第一块不是段落时单独一个 <p>；
// - 表格每列的对齐（T-4）：单元格的 text-align。
// 每个块的装饰只取决于这个块自己，按节点对象缓存；每次事务只重算改动的地方（X-3）
import { ALERT_ICONS, ALERT_TITLES } from "@marko/render";
import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { runSourceCommand, type SourceCommand } from "../commands/run.ts";
import { toModel } from "../state.ts";

export const blockWidgetsKey = new PluginKey<DecorationSet>("markoBlockWidgets");

/** 切换文档位置 pos 上的列表项的任务框：只改 `[ ]` 里那一个字符，选区不动 */
export function toggleTaskItem(pos: number): SourceCommand {
  return ({ state, source }) => {
    const item = state.doc.nodeAt(pos);
    if (!item || item.type.name !== "listItem") return null;
    const range = source.map.map.ranges.get(toModel(item));
    if (!range) return null;
    const lineEnd = source.text.indexOf("\n", range.start);
    const line = source.text.slice(range.start, lineEnd < 0 ? source.text.length : lineEnd);
    const match = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\]/.exec(line);
    if (!match) return null;
    const at = range.start + match[0].length - 2;
    const next = match[1] === " " ? "x" : " ";
    return { text: source.text.slice(0, at) + next + source.text.slice(at + 1), anchor: source.anchor, head: source.head };
  };
}

/** 复选框所在的列表项的位置 */
function itemAt(view: EditorView, element: HTMLElement): number | null {
  const pos = view.posAtDOM(element, 0);
  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "listItem") return $pos.before(depth);
  }
  const after = $pos.nodeAfter;
  return after?.type.name === "listItem" ? pos : null;
}

function checkbox(editor: Editor, checked: boolean): (view: EditorView) => HTMLElement {
  return (view) => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "md-task-checkbox";
    input.checked = checked;
    input.contentEditable = "false";
    input.addEventListener("mousedown", (event) => event.preventDefault());
    input.addEventListener("click", (event) => {
      event.preventDefault();
      if (!view.editable) return;
      const pos = itemAt(view, input);
      if (pos !== null) runSourceCommand(editor, toggleTaskItem(pos));
    });
    return input;
  };
}

function alertTitle(kind: string, block: boolean): () => HTMLElement {
  return () => {
    const text = document.createElement("span");
    text.className = `md-alert-text md-alert-text-${kind}`;
    // 图标是包里自带的 Octicons SVG（不是文档内容）
    text.innerHTML = ALERT_ICONS[kind] ?? "";
    text.append(ALERT_TITLES[kind] ?? "");
    const wrapper = document.createElement(block ? "p" : "span");
    wrapper.className = "md-alert-title";
    wrapper.contentEditable = "false";
    wrapper.append(text);
    if (!block) wrapper.append(document.createElement("br"));
    return wrapper;
  };
}

/** 一个块自己的装饰（位置相对于块的开头，pos 之前） */
interface Relative {
  from: number;
  to: number;
  make: (base: number) => Decoration;
}

const cache = new WeakMap<PMNode, Relative[]>();

function relativeDecorations(node: PMNode, editor: Editor): Relative[] {
  const cached = cache.get(node);
  if (cached) return cached;
  const result: Relative[] = [];
  const name = node.type.name;
  if (name === "listItem" && node.attrs.checked !== null && node.attrs.checked !== undefined) {
    const checked = Boolean(node.attrs.checked);
    result.push({ from: 1, to: 1, make: (base) => Decoration.widget(base + 1, checkbox(editor, checked), { side: -1, key: `task:${checked}`, ignoreSelection: true, stopEvent: () => true }) });
  } else if (name === "alert") {
    const requested = String(node.attrs.kind ?? "note");
    const kind = Object.hasOwn(ALERT_TITLES, requested) ? requested : "note";
    const first = node.firstChild;
    // 同导出：第一段是段落时标题在它开头、后面换行；否则标题单独一段
    const inline = first?.type.name === "paragraph";
    const at = inline ? 2 : 1;
    result.push({ from: at, to: at, make: (base) => Decoration.widget(base + at, alertTitle(kind, !inline), { side: -1, key: `alert:${kind}:${inline}`, ignoreSelection: true }) });
  } else if (name === "table") {
    const align = (node.attrs.align as Array<string | null> | null) ?? [];
    if (align.some(Boolean)) {
      node.forEach((row, rowOffset) => {
        row.forEach((cell, cellOffset, column) => {
          const value = align[column];
          if (!value) return;
          const from = 1 + rowOffset + 1 + cellOffset;
          const to = from + cell.nodeSize;
          result.push({ from, to, make: (base) => Decoration.node(base + from, base + to, { style: `text-align: ${value}` }) });
        });
      });
    }
  }
  cache.set(node, result);
  return result;
}

function decorationsIn(doc: PMNode, editor: Editor, from = 0, to = doc.content.size): Decoration[] {
  const result: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock || node.isAtom) return false;
    for (const relative of relativeDecorations(node, editor)) result.push(relative.make(pos));
    return true;
  });
  return result;
}

/** 事务改到的块（最后的文档上）：改动范围外面的各层容器都算上 */
function touchedRange(state: EditorState, ranges: Array<{ from: number; to: number }>): { from: number; to: number } | null {
  if (!ranges.length) return null;
  let from = Math.min(...ranges.map((range) => range.from));
  let to = Math.max(...ranges.map((range) => range.to));
  const doc = state.doc;
  // 扩到顶层块的边界：外层容器（列表、Callout、表格）的装饰也取决于里面的内容
  const $from = doc.resolve(Math.max(0, Math.min(from, doc.content.size)));
  const $to = doc.resolve(Math.max(0, Math.min(to, doc.content.size)));
  from = $from.depth > 0 ? $from.before(1) : from;
  to = $to.depth > 0 ? $to.after(1) : to;
  return { from, to };
}

export const BlockWidgets = Extension.create({
  name: "markoBlockWidgets",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<DecorationSet>({
        key: blockWidgetsKey,
        state: {
          init: (_config, state) => DecorationSet.create(state.doc, decorationsIn(state.doc, editor)),
          apply(tr, value, _old, state) {
            if (!tr.docChanged) return value;
            const ranges: Array<{ from: number; to: number }> = [];
            tr.mapping.maps.forEach((map, index) => {
              const rest = tr.mapping.slice(index + 1);
              map.forEach((_oldStart, _oldEnd, newStart, newEnd) => ranges.push({ from: rest.map(newStart, -1), to: rest.map(newEnd, 1) }));
            });
            const range = touchedRange(state, ranges);
            let decorations = value.map(tr.mapping, state.doc);
            if (!range) return decorations;
            decorations = decorations.remove(decorations.find(range.from, range.to));
            return decorations.add(state.doc, decorationsIn(state.doc, editor, range.from, range.to));
          },
        },
        props: {
          decorations: (state) => blockWidgetsKey.getState(state),
        },
      }),
    ];
  },
});
