// Emoji 补全（I-5）的列表：候选、键盘选择是 @tiptap/suggestion 的（编辑器核心），这里把它的回调换成响应式的状态，
// 界面是 EmojiList.vue（Element Plus 的弹出框：贴着光标、靠近窗口底边时自动翻到上面）
import type { EmojiItem, EmojiRenderer } from "@marko/editor";
import { shallowReactive } from "vue";

export interface EmojiListState {
  visible: boolean;
  items: EmojiItem[];
  selected: number;
  /** 光标处的位置（弹出框贴着它） */
  rect: DOMRect | null;
  choose: ((item: EmojiItem) => void) | null;
}

export function createEmojiBridge(): { state: EmojiListState; render: EmojiRenderer } {
  const state = shallowReactive<EmojiListState>({ visible: false, items: [], selected: 0, rect: null, choose: null });
  const render: EmojiRenderer = () => {
    const update = (props: { items: EmojiItem[]; command: (item: EmojiItem) => void; clientRect?: (() => DOMRect | null) | null }) => {
      state.items = props.items;
      state.selected = 0;
      state.choose = (item) => props.command(item);
      state.rect = props.clientRect?.() ?? null;
      state.visible = props.items.length > 0 && state.rect !== null;
    };
    return {
      onStart: update,
      onUpdate: update,
      // ↑ ↓ 选择，回车或 Tab 确认（Esc 由补全插件自己关）
      onKeyDown({ event }) {
        if (!state.visible || !state.items.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          state.selected = (state.selected + (event.key === "ArrowDown" ? 1 : state.items.length - 1)) % state.items.length;
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = state.items[state.selected];
          if (item) state.choose?.(item);
          return true;
        }
        return false;
      },
      onExit() {
        state.visible = false;
        state.items = [];
        state.choose = null;
      },
    };
  };
  return { state, render };
}
