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

export interface OutlineItem {
  id: string;
  title: string;
  level: number;
  line: number;
}

export interface SelectionStats {
  chars: number;
  words: number;
  lines: number;
}

export interface DocumentStats {
  chars: number;
  words: number;
  paragraphs: number;
  readingMinutes: number;
}

export type ThemeName = "solo" | "dark";

export type ExportFormat = "pdf" | "docx" | "rtf" | "epub";

export interface MarkdownExtensionSettings {
  html: boolean;
  toc: boolean;
  mermaid: boolean;
  flowchart: boolean;
  footnote: boolean;
  alerts: boolean;
  emoji: boolean;
  marks: boolean;
}

export interface EditorSettings {
  theme: ThemeName;
  fontSize: number;
  lineWidth: number;
  zoom: number;
  spellcheck: boolean;
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  autoPair: boolean;
  uploadUrl: string;
  uploadToken: string;
  extensions: MarkdownExtensionSettings;
}

export interface ImagePayload {
  name: string;
  dataUrl: string;
}

export type EditorCommand =
  | "undo"
  | "redo"
  | "copy"
  | "cut"
  | "paste"
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "highlight"
  | "superscript"
  | "subscript"
  | "link"
  | "image"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "toggleTask"
  | "hr"
  | "codeBlock"
  | "table"
  | "addTableRow"
  | "addTableColumn"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "toc"
  | "frontmatter"
  | "callout"
  | "mermaid"
  | "flowchart"
  | "setImageWidth";
