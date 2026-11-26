// Markdown 的解析、文档模型、无损序列化和语义层（1.3、1.5 节）。纯 TS，不碰 DOM

export {
  ATOM_TYPES,
  CODE_TYPES,
  CONTAINER_TYPES,
  TEXTBLOCK_TYPES,
  blockChildren,
  getOrigin,
  inheritOrigin,
  isAtom,
  isBlankParagraph,
  isCode,
  isContainer,
  isLeaf,
  isTextblock,
  makeContainer,
  makeLeaf,
  nodeText,
  placeholderOrigin,
  setOrigin,
  type AlertKind,
  type BlockType,
  type DiagramKind,
  type MdNode,
  type MdText,
  type Origin,
  type TableAlign,
} from "./model.ts";
export { parse, readTableAlignments, splitTableRow, type ParseOptions } from "./parse.ts";
export { serialize, serializeRange, type SerializeOptions } from "./serialize.ts";
export { applyReplacement, reconcile, sameStructure, type Replacement } from "./reconcile.ts";
export { fragmentsAt, inlineFragments, walkFragments, type Fragment, type FragmentType, type Range } from "./inline.ts";
export { buildSourceMap, lineColumn, locateSource, sourceOffset, type BlockRange, type LeafPosition, type SourceMap } from "./positions.ts";
export { DEFAULT_SYNTAX, resolveSyntax, type SyntaxOptions } from "./syntax/index.ts";
export { ALERT_KINDS, isTocMarker, readAlertMarker } from "./syntax/blocks.ts";
export { assignAnchors, collectHeadings, collectOutline, headingAnchor, headingTitle, type OutlineItem, type OutlineOptions } from "./semantics/outline.ts";
export { collectFootnotes, footnoteSummary, type FootnoteDefinitionInfo, type FootnoteReferenceInfo, type Footnotes } from "./semantics/footnotes.ts";
export {
  collectReferences,
  parseReferenceDefinition,
  referenceChecker,
  resolveReference,
  unescapeMarkdown,
  type ReferenceDefinitionInfo,
} from "./semantics/references.ts";
export { collectAbbreviations, findAbbreviations, type AbbreviationInfo, type AbbreviationMatch } from "./semantics/abbreviations.ts";
export { readFrontMatter, type FrontMatterInfo } from "./semantics/frontMatter.ts";
export {
  documentStats,
  markdownStats,
  sourceCounts,
  textStats,
  visibleText,
  wordCount,
  wordCounts,
  wordCountText,
  type DocumentStats,
  type StatsOptions,
  type TextStats,
  type WordCounts,
} from "./semantics/stats.ts";
export { normalizeLabel } from "./semantics/labels.ts";
export { plainText, type PlainTextOptions } from "./semantics/text.ts";
