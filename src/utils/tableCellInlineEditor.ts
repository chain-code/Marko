export interface TableCellEditorSelection {
  anchor: number;
  head: number;
}

export interface TableCellInlineEditorHandle {
  focus: (selection?: TableCellEditorSelection) => void;
  blur: () => void;
  getValue: () => string;
  getSelection: () => TableCellEditorSelection;
  setSelection: (selection: TableCellEditorSelection) => void;
  replaceSelection: (text: string) => void;
  posAtCoords: (point: { x: number; y: number }) => number | null;
  getElement: () => HTMLElement | null;
}

export type TableCellEditorUserEvent =
  | "input.type.compose.start"
  | "input.type.compose";
