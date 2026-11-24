// Emoji 补全（I-5）：用 @tiptap/suggestion（触发、候选、键盘选择是现成的），shortcode 表是 @marko/render 的（emojibase 的 GitHub 那套）。
// 输入 `:` 加字母弹出列表；↑ ↓ 选择，回车或 Tab 确认（写成 `:shortcode:`），Esc 关闭。
// S-5「Emoji 自动完成」：自动触发 / 按 Esc 触发 / 关闭。代码、公式里不弹。
// 列表的界面：这里给一个不依赖框架的默认实现，editor-vue 可以换成自己的（options.render）
import { inlineFragments, walkFragments } from "@marko/markdown";
import { emojiFor, emojiShortcodes } from "@marko/render";
import { Extension, type Editor } from "@tiptap/core";
import { PluginKey, type EditorState } from "@tiptap/pm/state";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import { INLINE_TEXTBLOCKS } from "../plugins/inlineSyntax.ts";

export interface EmojiItem {
  shortcode: string;
  emoji: string;
}

export const emojiSuggestionKey = new PluginKey("markoEmojiSuggestion");

/** 候选：完全相同的排最前，然后是开头相同的，再然后是包含的；最多 limit 个 */
export function emojiItems(query: string, limit = 10): EmojiItem[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const shortcode of emojiShortcodes()) {
    if (shortcode === needle) exact.push(shortcode);
    else if (shortcode.startsWith(needle)) prefix.push(shortcode);
    else if (shortcode.includes(needle)) contains.push(shortcode);
  }
  const byLength = (left: string, right: string) => left.length - right.length || left.localeCompare(right);
  return [...exact, ...prefix.sort(byLength), ...contains.sort(byLength)].slice(0, limit).map((shortcode) => ({ shortcode, emoji: emojiFor(shortcode) ?? "" }));
}

/** 光标在代码、公式这类原样的片段里（不弹补全） */
function insideLiteral(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  if (!INLINE_TEXTBLOCKS.has($pos.parent.type.name)) return true;
  const text = $pos.parent.textContent;
  const offset = $pos.parentOffset;
  let literal = false;
  walkFragments(inlineFragments(text), (fragment) => {
    if ((fragment.type === "code" || fragment.type === "math" || fragment.type === "url" || fragment.type === "autolink") && offset > fragment.from && offset <= fragment.to) literal = true;
  });
  return literal;
}

/** 候选列表的界面（editor-vue 换成 Element Plus 的） */
export type EmojiRenderer = NonNullable<SuggestionOptions<EmojiItem, EmojiItem>["render"]>;
type Renderer = EmojiRenderer;

/** 默认的候选列表：挂在 body 上的一个绝对定位的列表 */
export const defaultEmojiRenderer: Renderer = () => {
  let list: HTMLElement | null = null;
  let items: EmojiItem[] = [];
  let selected = 0;
  let choose: ((item: EmojiItem) => void) | null = null;
  const draw = () => {
    if (!list) return;
    list.replaceChildren(
      ...items.map((item, index) => {
        const option = document.createElement("div");
        option.className = index === selected ? "md-emoji-option md-emoji-option-selected" : "md-emoji-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === selected));
        const glyph = document.createElement("span");
        glyph.className = "md-emoji";
        glyph.textContent = item.emoji;
        const name = document.createElement("span");
        name.className = "md-emoji-name";
        name.textContent = `:${item.shortcode}:`;
        option.append(glyph, name);
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose?.(item);
        });
        return option;
      }),
    );
    list.hidden = items.length === 0;
  };
  const place = (props: SuggestionProps<EmojiItem, EmojiItem>) => {
    const rect = props.clientRect?.();
    if (!list || !rect) return;
    list.style.left = `${rect.left + window.scrollX}px`;
    list.style.top = `${rect.bottom + window.scrollY + 4}px`;
  };
  return {
    onStart(props) {
      list = document.createElement("div");
      list.className = "md-emoji-suggestions";
      list.setAttribute("role", "listbox");
      document.body.append(list);
      items = props.items;
      selected = 0;
      choose = (item) => props.command(item);
      draw();
      place(props);
    },
    onUpdate(props) {
      items = props.items;
      selected = 0;
      choose = (item) => props.command(item);
      draw();
      place(props);
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!items.length) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        selected = (selected + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        choose?.(items[selected]);
        return true;
      }
      return false;
    },
    onExit() {
      list?.remove();
      list = null;
      choose = null;
    },
  };
};

export interface EmojiSuggestionOptions {
  render: Renderer;
}

/** 「按 Esc 触发」时：按了 Esc 以后这一次的 `:xxx` 才弹 */
const escRequested = new WeakMap<Editor, boolean>();

export const EmojiSuggestion = Extension.create<EmojiSuggestionOptions>({
  name: "markoEmojiSuggestion",
  addOptions: () => ({ render: defaultEmojiRenderer }),
  addKeyboardShortcuts() {
    return {
      Escape: () => {
        const editor = this.editor;
        if (editor.storage.marko.settings.emojiAutoComplete !== "esc" || escRequested.get(editor)) return false;
        const { $head, empty } = editor.state.selection;
        if (!empty || !/(?:^|\s):[\w+-]+$/.test($head.parent.textContent.slice(0, $head.parentOffset))) return false;
        escRequested.set(editor, true);
        // 让补全插件按新的条件重新看一遍
        editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const render = this.options.render;
    return [
      Suggestion<EmojiItem, EmojiItem>({
        editor,
        pluginKey: emojiSuggestionKey,
        char: ":",
        allowSpaces: false,
        minQueryLength: 1,
        items: ({ query }) => emojiItems(query),
        allow: ({ state, range }) => {
          const mode = editor.storage.marko.settings.emojiAutoComplete;
          if (mode === "off" || !editor.storage.marko.syntax.emoji || editor.view.composing) return false;
          if (mode === "esc" && !escRequested.get(editor)) return false;
          return !insideLiteral(state, range.from);
        },
        command: ({ editor: current, range, props }) => {
          escRequested.delete(current);
          current.view.dispatch(current.state.tr.insertText(`:${props.shortcode}:`, range.from, range.to).scrollIntoView());
        },
        render: () => {
          const inner = render();
          return {
            ...inner,
            onExit: (props) => {
              escRequested.delete(editor);
              inner.onExit?.(props);
            },
          };
        },
      }),
    ];
  },
});
