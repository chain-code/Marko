// 在新编辑器上执行一条行为规格（格式见 test/behavior/README.md）：before 解析成文档、放好选区、执行操作、序列化后和 after 比较
import { writeFileSync } from "node:fs";
import type { Editor } from "@tiptap/core";
import { createMarkoEditor, getMarkdownWithSelection, setMarkdown, type EditorSettings } from "../../src/index.ts";
import { lineStartOf } from "../../src/commands/text.ts";
import { isDeferredLine } from "../../src/plugins/defer.ts";
import { SKIP_RECONCILE } from "../../src/plugins/reconcile.ts";
import { markText, type MarkedText, type Operation, type Spec } from "./spec.ts";

export interface SpecResult {
  pass: boolean;
  actual: MarkedText | null;
  error?: string;
  /** before 放进编辑器再读出来不一样（新编辑器表示不了这个光标位置）时，读出来的样子 */
  setup?: MarkedText;
}

/** 规格操作后面括号里的设置 */
function settingsFor(note: string | null): Partial<EditorSettings> {
  const settings: Partial<EditorSettings> = { indentSize: 2, codeIndentSize: 4, defaultCodeLanguage: "", defaultCodeLanguageApplyTo: "markdown" };
  if (!note) return settings;
  const indent = /Markdown 缩进宽度 (\d+)/.exec(note);
  if (indent) settings.indentSize = Number(indent[1]);
  const codeIndent = /代码缩进宽度 (\d+)/.exec(note);
  if (codeIndent) settings.codeIndentSize = Number(codeIndent[1]);
  // 「语言 "ts"」：菜单插入代码块时的默认语言；「默认代码语言 "typescript"」：输入围栏时的默认语言（S-7）
  const menu = /^语言 ("(?:[^"\\]|\\.)*")/.exec(note);
  if (menu) {
    settings.defaultCodeLanguage = JSON.parse(menu[1]) as string;
    settings.defaultCodeLanguageApplyTo = "menu";
  }
  const typed = /默认代码语言 ("(?:[^"\\]|\\.)*")/.exec(note);
  if (typed) {
    settings.defaultCodeLanguage = JSON.parse(typed[1]) as string;
    settings.defaultCodeLanguageApplyTo = "markdown";
  }
  return settings;
}

/** 「Ctrl+Shift+`」→ keydown 事件 */
function keyEvent(combo: string): KeyboardEvent {
  const parts = combo.split("+");
  // 最后一段是键本身；「Ctrl++」这种写法里键是 +
  const modifiers = new Set(parts.slice(0, -1));
  let key = combo.endsWith("++") ? "+" : parts[parts.length - 1];
  // 浏览器给的字母键：不按 Shift 时是小写（规格里写成 Ctrl+B）
  if (/^[A-Za-z]$/.test(key)) key = modifiers.has("Shift") ? key.toUpperCase() : key.toLowerCase();
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: modifiers.has("Ctrl"),
    shiftKey: modifiers.has("Shift"),
    altKey: modifiers.has("Alt"),
    metaKey: modifiers.has("Meta") || modifiers.has("Cmd"),
    bubbles: true,
    cancelable: true,
  });
}

function pressKey(editor: Editor, combo: string): void {
  const view = editor.view;
  const event = keyEvent(combo);
  const handled = view.someProp("handleKeyDown", (handler) => handler(view, event));
  if (handled || (combo !== "Backspace" && combo !== "Delete")) return;
  // 编辑器不处理时浏览器的默认行为：文本块里删一个字符（代理对算一个）
  const { $head, empty } = view.state.selection;
  if (!empty) {
    view.dispatch(view.state.tr.deleteSelection());
    return;
  }
  const text = $head.parent.textContent;
  const offset = $head.parentOffset;
  if (combo === "Backspace" && offset > 0) {
    const code = text.charCodeAt(offset - 1);
    const length = code >= 0xdc00 && code <= 0xdfff && offset >= 2 ? 2 : 1;
    view.dispatch(view.state.tr.delete($head.pos - length, $head.pos));
  } else if (combo === "Delete" && offset < text.length) {
    const code = text.charCodeAt(offset);
    const length = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
    view.dispatch(view.state.tr.delete($head.pos, $head.pos + length));
  }
}

/** 一个字一个字地输入（输入规则、自动配对按真实输入触发） */
function typeText(editor: Editor, text: string): void {
  const view = editor.view;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(char, from, to);
    const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, deflt));
    if (!handled) view.dispatch(deflt());
  }
}

function runCommand(editor: Editor, name: string, args: unknown[]): void {
  const commands = editor.commands as unknown as Record<string, (...values: unknown[]) => boolean>;
  const command = commands[name];
  if (!command) throw new Error(`没有命令 ${name}`);
  command(...args);
}

function perform(editor: Editor, op: Operation): void {
  switch (op.kind) {
    case "key":
      pressKey(editor, op.key);
      return;
    case "input":
      typeText(editor, op.text);
      return;
    case "command":
      runCommand(editor, op.name, op.args);
      return;
    case "paste":
      if (op.plain) runCommand(editor, "pastePlainText", [op.text ?? ""]);
      else runCommand(editor, "pasteContent", [{ text: op.text ?? "", html: op.html ?? "" }]);
      return;
  }
}

let shared: Editor | null = null;

/** 规格共用的编辑器（调试用） */
export function sharedEditor(): Editor | null {
  return shared;
}

function sameMarked(left: MarkedText, right: MarkedText): boolean {
  return left.value === right.value && left.anchor === right.anchor && left.head === right.head;
}

/**
 * before 直接解析表示不了时（光标在 `---`、```` ```md ```` 这一行的末尾）：这一行当成正在输入、还没转换的段落
 * （E-4 要按回车才转换的写法，plugins/defer.ts）。先把这一行的内容换成同样长的普通字符解析，再把原来的字符填回段落
 */
function setTypingMarkdown(editor: Editor, before: MarkedText): boolean {
  const { value, head } = before;
  if (before.anchor !== head) return false;
  const lineStart = lineStartOf(value, head);
  const newline = value.indexOf("\n", head);
  let lineEnd = newline < 0 ? value.length : newline;
  if (lineEnd > lineStart && value[lineEnd - 1] === "\r") lineEnd -= 1;
  // 文件开头的 BOM 不是内容
  const bom = lineStart === 0 && value.startsWith("﻿") ? 1 : 0;
  const lineText = value.slice(lineStart + bom, lineEnd);
  // 整行只有引用的 `>`（正在输入 `>`、`> >`）时它们就是内容，不是前缀
  const prefix = (/^[ \t]*(?:>[ \t]?)+$/.test(lineText) ? /^[ \t]*/ : /^[ \t]*(?:>[ \t]?)*/).exec(lineText)?.[0] ?? "";
  const contentStart = lineStart + bom + prefix.length;
  // 光标在这一行的引用前缀前面（行首）时，当成在内容开头（编辑器里光标进不了前缀）
  if ((head < contentStart && head !== lineStart) || lineEnd === contentStart) return false;
  const original = value.slice(contentStart, lineEnd);
  // 只有要等回车才转换的写法（plugins/defer.ts）会处在「正在输入」的状态
  const previousLine = lineStart > 0 ? value.slice(lineStartOf(value, lineStart - 1), lineStart - 1).replace(/\r$/, "") : "";
  if (!isDeferredLine(original, previousLine.trim() !== "")) return false;
  const cursor = Math.max(head, contentStart);
  setMarkdown(editor, value.slice(0, contentStart) + "x".repeat(original.length) + value.slice(lineEnd), { anchor: cursor, head: cursor });
  const { $head } = editor.state.selection;
  if ($head.parent.type.name !== "paragraph") return false;
  const from = $head.pos - (cursor - contentStart);
  if (from < $head.start()) return false;
  const tr = editor.state.tr.insertText(original, from, from + original.length);
  tr.setMeta(SKIP_RECONCILE, true).setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  const loaded = getMarkdownWithSelection(editor);
  return loaded.value === value && loaded.anchor === cursor && loaded.head === cursor;
}

export function runSpec(spec: Spec): SpecResult {
  // 设了 MARKO_BEHAVIOR_TRACE=<文件> 时记下正在跑哪一条（卡住时看是哪条）
  if (process.env.MARKO_BEHAVIOR_TRACE) writeFileSync(process.env.MARKO_BEHAVIOR_TRACE, `${spec.file}:${spec.line} ${spec.title}`);
  try {
    shared ??= createMarkoEditor();
    const editor = shared;
    Object.assign(editor.storage.marko.settings, settingsFor(spec.note));
    editor.storage.marko.sourceMode = spec.note?.includes("源码模式") ?? false;
    // 光标这一行是还要等回车、空格才转换的写法时，编辑器里它是正在输入的段落（plugins/defer.ts），先这样摆；
    // 摆不出来再直接解析
    if (!setTypingMarkdown(editor, spec.before)) {
      setMarkdown(editor, spec.before.value, { anchor: spec.before.anchor, head: spec.before.head });
    }
    const loaded = getMarkdownWithSelection(editor);
    const setup = sameMarked(loaded, spec.before) ? undefined : loaded;
    perform(editor, spec.op);
    const actual = getMarkdownWithSelection(editor);
    const pass = actual.value === spec.after.value && actual.anchor === spec.after.anchor && actual.head === spec.after.head;
    return { pass, actual, setup };
  } catch (error) {
    return { pass: false, actual: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 失败时打印用 */
export function describeFailure(spec: Spec, result: SpecResult): string {
  return [
    `${spec.file}:${spec.line} ${spec.id} ${spec.title}`,
    `操作：${spec.raw}`,
    "期望：",
    markText(spec.after),
    "实际：",
    result.actual ? markText(result.actual) : `（出错）${result.error}`,
    ...(result.setup ? ["（before 放进编辑器后读出来是：）", markText(result.setup)] : []),
  ].join("\n");
}
