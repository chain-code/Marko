// 组件里的文字（K-2「界面文字」、L-2）：宿主通过 host.texts 按界面语言给；不给、给了一部分时其余的用中文（同旧版）。
// MarkoEditor 算好合并后的文字 provide 下去，浮层、小窗口 inject；宿主的文字变了（换语言）跟着变
import { DEFAULT_TEXTS } from "@marko/editor";
import { computed, inject, type ComputedRef, type InjectionKey } from "vue";
import type { MarkoEditorTexts, MarkoEditorTextsInput } from "./types.ts";

export const DEFAULT_MARKO_TEXTS: MarkoEditorTexts = {
  ...DEFAULT_TEXTS,
  diagramUnsupported: (kind) => `不支持的图表：${kind}`,
  codeLanguage: "语言",
  ok: "确定",
  cancel: "取消",
  table: {
    insert: "插入表格",
    columns: "列",
    rows: "行",
    more: "更多操作",
    alignLeft: "左对齐",
    alignCenter: "居中对齐",
    alignRight: "右对齐",
    addRowAbove: "上方插入行",
    addRowBelow: "下方插入行",
    addColumnLeft: "左侧插入列",
    addColumnRight: "右侧插入列",
    deleteRow: "删除行",
    deleteRowShort: "✕行",
    deleteColumn: "删除列",
    deleteColumnShort: "✕列",
    moveRowUp: "上移该行",
    moveRowDown: "下移该行",
    moveColumnLeft: "左移该列",
    moveColumnRight: "右移该列",
    selectRow: "选择行",
    selectColumn: "选择列",
    selectTable: "选择表格",
    deleteTable: "删除表格",
  },
  viewer: {
    zoomOut: "缩小（-）",
    zoomIn: "放大（+）",
    actualSize: "原始大小（0）",
  },
};

/** 宿主给的文字补上默认的（表格、查看器两组按条补） */
export function mergeTexts(input: MarkoEditorTextsInput | undefined): MarkoEditorTexts {
  if (!input) return DEFAULT_MARKO_TEXTS;
  return {
    ...DEFAULT_MARKO_TEXTS,
    ...input,
    table: { ...DEFAULT_MARKO_TEXTS.table, ...input.table },
    viewer: { ...DEFAULT_MARKO_TEXTS.viewer, ...input.viewer },
  } as MarkoEditorTexts;
}

export const TEXTS: InjectionKey<ComputedRef<MarkoEditorTexts>> = Symbol("marko-editor-texts");

/** 浮层、小窗口里用：不在 MarkoEditor 里（单独测试）时是默认的中文 */
export function useTexts(): ComputedRef<MarkoEditorTexts> {
  return inject(
    TEXTS,
    computed(() => DEFAULT_MARKO_TEXTS),
    true,
  );
}
