// 编辑器组件里的文字（K-2「界面文字」、L-2）：按界面语言从翻译里取，交给 host.texts。
// 每次读都现取：组件里算文字的地方跟着当前语言更新
import type { MarkoEditorTexts } from "@marko/editor-vue";
import { t } from "./i18n.ts";

export function editorTexts(): MarkoEditorTexts {
  return {
    tableColumn: (n) => t("editor.content.tableColumn", { n }),
    tableCell: t("editor.content.tableCell"),
    newColumn: t("editor.content.newColumn"),
    linkText: t("editor.content.linkText"),
    imageAlt: t("editor.content.imageAlt"),
    commentText: t("editor.content.commentText"),
    footnote: t("editor.content.footnote"),
    frontMatterTitle: t("editor.content.frontMatterTitle"),
    diagramStart: t("editor.content.diagramStart"),
    diagramEnd: t("editor.content.diagramEnd"),
    insertFailed: (kind, name, reason) => t("editor.insertFailed", { kind: t(`editor.kind.${kind}`), name, reason }),
    diagramUnsupported: (kind) => t("diagram.unsupported", { kind }),
    codeLanguage: t("editor.codeLanguage"),
    ok: t("common.ok"),
    cancel: t("common.cancel"),
    table: {
      insert: t("editor.table.insert"),
      columns: t("editor.table.columns"),
      rows: t("editor.table.rows"),
      more: t("editor.table.more"),
      alignLeft: t("editor.table.alignLeft"),
      alignCenter: t("editor.table.alignCenter"),
      alignRight: t("editor.table.alignRight"),
      addRowAbove: t("editor.table.addRowAbove"),
      addRowBelow: t("editor.table.addRowBelow"),
      addColumnLeft: t("editor.table.addColumnLeft"),
      addColumnRight: t("editor.table.addColumnRight"),
      deleteRow: t("editor.table.deleteRow"),
      deleteRowShort: t("editor.table.deleteRowShort"),
      deleteColumn: t("editor.table.deleteColumn"),
      deleteColumnShort: t("editor.table.deleteColumnShort"),
      moveRowUp: t("editor.table.moveRowUp"),
      moveRowDown: t("editor.table.moveRowDown"),
      moveColumnLeft: t("editor.table.moveColumnLeft"),
      moveColumnRight: t("editor.table.moveColumnRight"),
      selectRow: t("editor.table.selectRow"),
      selectColumn: t("editor.table.selectColumn"),
      selectTable: t("editor.table.selectTable"),
      deleteTable: t("editor.table.deleteTable"),
    },
    viewer: {
      zoomOut: t("editor.viewer.zoomOut"),
      zoomIn: t("editor.viewer.zoomIn"),
      actualSize: t("editor.viewer.actualSize"),
    },
  };
}
