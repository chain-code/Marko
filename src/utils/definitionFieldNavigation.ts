import { collectFootnoteSemantics } from "./footnoteSemantics";
import { collectReferenceDefinitionSemantics } from "./referenceDefinitionSemantics";

export type MarkdownDefinitionKind = "reference" | "footnote";
export type MarkdownDefinitionField = "label" | "url" | "title" | "content";

export interface MarkdownDefinitionFieldNavigation {
  definitionKind: MarkdownDefinitionKind;
  field: MarkdownDefinitionField | null;
  selectionStart: number;
  selectionEnd: number;
}

interface DefinitionFieldRange {
  field: MarkdownDefinitionField;
  from: number;
  to: number;
}

interface DefinitionNavigationRange {
  kind: MarkdownDefinitionKind;
  from: number;
  to: number;
  fields: DefinitionFieldRange[];
}

/**
 * 在链接引用定义和脚注定义的结构化字段间移动选区。
 * 返回 null 表示当前选区不属于定义，或已在边界继续向外移动。
 */
export function navigateMarkdownDefinitionField(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  backward = false,
): MarkdownDefinitionFieldNavigation | null {
  const start = clampOffset(Math.min(selectionStart, selectionEnd), source.length);
  const end = clampOffset(Math.max(selectionStart, selectionEnd), source.length);
  const definitions = collectDefinitionNavigationRanges(source).filter((candidate) => (
    start >= candidate.from && end <= candidate.to
  ));
  const definition = chooseDefinitionAtSharedBoundary(definitions, start, end, backward);
  if (!definition) return null;

  const onEmptyField = definition.fields.some((field) => (
    field.from === field.to && start === field.from && end === field.to
  ));
  if (
    !onEmptyField &&
    start === end
    && ((backward && start === definition.from) || (!backward && start === definition.to))
  ) {
    return null;
  }
  const atDefinitionBoundary = !onEmptyField
    && start === end
    && (start === definition.from || start === definition.to);
  const currentIndex = atDefinitionBoundary
    ? null
    : findCurrentFieldIndex(definition.fields, start, end);
  const targetIndex = currentIndex === null
    ? findDirectionalFieldIndex(definition.fields, start, end, backward)
    : currentIndex + (backward ? -1 : 1);
  if (targetIndex < 0) {
    return createBoundaryResult(definition, definition.from);
  }
  if (targetIndex >= definition.fields.length) {
    return createBoundaryResult(definition, definition.to);
  }

  const target = definition.fields[targetIndex];
  if (!target) return null;
  return {
    definitionKind: definition.kind,
    field: target.field,
    selectionStart: target.from,
    selectionEnd: target.to,
  };
}

function collectDefinitionNavigationRanges(source: string): DefinitionNavigationRange[] {
  const references = collectReferenceDefinitionSemantics(source).map((definition) => ({
    kind: "reference" as const,
    from: definition.from,
    to: definition.to,
    fields: [definition.label, definition.url, ...(definition.title ? [definition.title] : [])]
      .map((field, index): DefinitionFieldRange => ({
        field: (["label", "url", "title"] as const)[index],
        from: field.from,
        to: field.to,
      })),
  }));
  const footnotes = collectFootnoteSemantics(source).definitions.map((definition) => ({
    kind: "footnote" as const,
    from: definition.from,
    to: definition.to,
    fields: [
      { field: "label" as const, from: definition.label.from, to: definition.label.to },
      { field: "content" as const, from: definition.content.from, to: definition.content.to },
    ],
  }));

  return [...references, ...footnotes]
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function chooseDefinitionAtSharedBoundary(
  definitions: DefinitionNavigationRange[],
  selectionStart: number,
  selectionEnd: number,
  backward: boolean,
): DefinitionNavigationRange | null {
  if (definitions.length === 0) return null;
  if (definitions.length === 1 || selectionStart !== selectionEnd) return definitions[0] ?? null;
  if (backward) {
    return definitions.find((definition) => definition.to === selectionStart)
      ?? definitions.at(-1)
      ?? null;
  }
  return definitions.find((definition) => definition.from === selectionStart)
    ?? definitions[0]
    ?? null;
}

function findCurrentFieldIndex(
  fields: DefinitionFieldRange[],
  selectionStart: number,
  selectionEnd: number,
): number | null {
  const exact = fields.findIndex((field) => (
    selectionStart === field.from && selectionEnd === field.to
  ));
  if (exact >= 0) return exact;

  if (selectionStart === selectionEnd) {
    const containing = fields.findIndex((field) => (
      selectionStart >= field.from && selectionStart <= field.to
    ));
    return containing >= 0 ? containing : null;
  }

  const intersecting = fields.findIndex((field) => (
    selectionStart < field.to && selectionEnd > field.from
  ));
  return intersecting >= 0 ? intersecting : null;
}

function findDirectionalFieldIndex(
  fields: DefinitionFieldRange[],
  selectionStart: number,
  selectionEnd: number,
  backward: boolean,
): number {
  if (!backward) {
    const next = fields.findIndex((field) => field.from >= selectionEnd);
    return next >= 0 ? next : fields.length;
  }

  for (let index = fields.length - 1; index >= 0; index -= 1) {
    if (fields[index] && fields[index].to <= selectionStart) return index;
  }
  return -1;
}

function createBoundaryResult(
  definition: DefinitionNavigationRange,
  offset: number,
): MarkdownDefinitionFieldNavigation {
  return {
    definitionKind: definition.kind,
    field: null,
    selectionStart: offset,
    selectionEnd: offset,
  };
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(length, Math.trunc(offset)));
}
