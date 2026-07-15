export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: FileEntry[];
}

export interface SearchResult {
  path: string;
  line: number;
  snippet: string;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export type SidebarFileContextSource = "tree" | "list" | "recent";

export type SidebarFileContextAction =
  | "newFileInFolder"
  | "newFolderInFolder"
  | "refreshFolder"
  | "openFile"
  | "renameFile"
  | "copyName"
  | "copyMarkdownLink"
  | "copyRelativePath"
  | "copyPath"
  | "revealFile"
  | "openContainingFolder"
  | "openFolderPath"
  | "openAsWorkspace"
  | "deletePath"
  | "removeRecent";

export interface SidebarFileContextTarget {
  path: string;
  name: string;
  isDir: boolean;
  source: SidebarFileContextSource;
}

export interface SidebarFileContextMenuItem {
  action: SidebarFileContextAction;
  label: string;
}

export interface OutlineItem {
  id: string;
  title: string;
  level: number;
  line: number;
}

export interface SelectionStats {
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
  chars: number;
  words: number;
  lines: number;
  cursorLine: number;
  cursorColumn: number;
}

export interface DocumentStats {
  chars: number;
  words: number;
  paragraphs: number;
  readingMinutes: number;
}

export type ThemeName = "solo" | "dark";

export type LineEnding = "auto" | "lf" | "crlf";

export type EmojiAutocompleteMode = "automatic" | "escape" | "off";

export type ImageInsertAction = "none" | "current" | "assets" | "documentAssets";

export type ExportFormat = "pdf" | "html" | "docx" | "rtf" | "epub";

export type SidebarTab = "files" | "outline" | "search";

export type FilePanelMode = "tree" | "list";

export interface MarkdownExtensionSettings {
  html: boolean;
  toc: boolean;
  mermaid: boolean;
  flowchart: boolean;
  math: boolean;
  footnote: boolean;
  alerts: boolean;
  emoji: boolean;
  marks: boolean;
  autoLinks: boolean;
}

export interface EditorSettings {
  theme: ThemeName;
  fontSize: number;
  lineWidth: number;
  zoom: number;
  autoSave: boolean;
  autoSaveIntervalMinutes: number;
  saveOnFileSwitch: boolean;
  recoverUnsavedDrafts: boolean;
  recordRecentFiles: boolean;
  showStatusBar: boolean;
  alwaysShowWordCount: boolean;
  defaultSidebarTab: SidebarTab;
  collapsibleOutline: boolean;
  readingSpeed: number;
  defaultLineEnding: LineEnding;
  insertFinalNewline: boolean;
  spellcheck: boolean;
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  typewriterCenter: boolean;
  indentSize: number;
  autoPair: boolean;
  emojiAutocomplete: EmojiAutocompleteMode;
  copyMarkdownAsPlainText: boolean;
  preserveSingleLineBreaks: boolean;
  smartPunctuation: boolean;
  codeLineNumbers: boolean;
  codeWrap: boolean;
  defaultCodeLanguage: string;
  imageInsertAction: ImageInsertAction;
  escapeImageUrls: boolean;
  addDotSlashToRelativeImagePath: boolean;
  uploadUrl: string;
  uploadToken: string;
  extensions: MarkdownExtensionSettings;
}

export interface ImagePayload {
  name: string;
  dataUrl: string;
}

export type ImageInsertRequest = (
  | ImagePayload
  | { name: string; file: File }
) & { placeholder?: string };

export type EditorCommand =
  | "undo"
  | "redo"
  | "copy"
  | "copyMarkdown"
  | "copyHtml"
  | "copyPlainText"
  | "cut"
  | "paste"
  | "pastePlainText"
  | "selectAll"
  | "selectStyleScope"
  | "selectLine"
  | "selectSentence"
  | "selectParagraph"
  | "selectWord"
  | "goToDocumentStart"
  | "goToDocumentEnd"
  | "deleteWord"
  | "deleteSentence"
  | "deleteParagraph"
  | "deleteStyleScope"
  | "duplicateLine"
  | "deleteLine"
  | "moveLineUp"
  | "moveLineDown"
  | "indent"
  | "outdent"
  | "paragraph"
  | "increaseHeading"
  | "decreaseHeading"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "inlineCode"
  | "inlineMath"
  | "mathBlock"
  | "footnote"
  | "clearFormat"
  | "highlight"
  | "superscript"
  | "subscript"
  | "comment"
  | "link"
  | "openLink"
  | "image"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "definitionList"
  | "toggleTask"
  | "hr"
  | "codeBlock"
  | "table"
  | "addTableRow"
  | "addTableColumn"
  | "addTableRowAbove"
  | "addTableRowBelow"
  | "addTableColumnLeft"
  | "addTableColumnRight"
  | "moveTableRowUp"
  | "moveTableRowDown"
  | "moveTableColumnLeft"
  | "moveTableColumnRight"
  | "selectTableCell"
  | "selectTableRow"
  | "selectTableColumn"
  | "selectTable"
  | "deleteTableRow"
  | "deleteTableColumn"
  | "deleteTable"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "toc"
  | "frontmatter"
  | "callout"
  | "mermaid"
  | "flowchart"
  | "setImageWidth";
