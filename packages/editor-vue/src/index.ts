// 编辑器的 Vue 包装（1.3 节、K 章）：对外的引用方式和旧版库相同（K-1）——
// import { MarkoMarkdownBody } from "marko"、import "marko/style.css"，类型也同名导出。
// 这里导出的只用到本包自己的类型（库的类型声明里没有编辑器内部的包）
import MarkoEditor from "./MarkoEditor.vue";

export { MarkoEditor };
/** 旧版库的名字（K-1：引用的代码不用改） */
export { MarkoEditor as MarkoMarkdownBody };
export { defaultEditorSettings, resolveSettings } from "./defaults.ts";
export type {
  DefaultCodeLanguageApplyTo,
  EditorSettings,
  EmojiAutocompleteMode,
  ImageInsertAction,
  ImageInsertRequest,
  ImagePayload,
  LineEnding,
  LocalMediaKind,
  MarkdownExtensionSettings,
  MarkoEditorHost,
  MarkoEditorTexts,
  MarkoEditorTextsInput,
  MarkoMarkdownBodyHandle,
  MathAutoNumbering,
  OutlineItem,
  ResourceKind,
  SidebarTab,
  ThemeName,
} from "./types.ts";
