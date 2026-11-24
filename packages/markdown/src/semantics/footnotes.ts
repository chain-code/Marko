// 脚注（B-11）：编号按在文中第一次出现的顺序；标签不分大小写；回链按每处引用一个
import { inlineFragments, walkFragments, type Fragment } from "../inline.ts";
import { blockChildren, isTextblock, nodeText, type MdNode } from "../model.ts";
import type { SyntaxOptions } from "../syntax/index.ts";
import { normalizeLabel } from "./labels.ts";
import { plainText } from "./text.ts";
import { textblocks, walkBlocks } from "./walk.ts";

export interface FootnoteDefinitionInfo {
  label: string;
  key: string;
  node: MdNode;
  path: number[];
  /** 按第一次被引用的顺序编号，从 1 开始；没被引用的为 null */
  number: number | null;
  /** 引用它的次数 */
  references: number;
}

export interface FootnoteReferenceInfo {
  label: string;
  key: string;
  /** 引用所在的文本块 */
  node: MdNode;
  path: number[];
  fragment: Fragment;
  /** 定义的编号；没有定义时为 null（按普通文字显示，点击时在文末新建定义） */
  number: number | null;
  /** 这是对同一个脚注的第几次引用（从 1 开始），回链用 */
  occurrence: number;
}

export interface Footnotes {
  /** 规范化的标签 → 定义；同名的只认第一个 */
  definitions: Map<string, FootnoteDefinitionInfo>;
  /** 所有引用，按文档顺序 */
  references: FootnoteReferenceInfo[];
  /** 有定义、被引用过的脚注，按编号排 */
  ordered: FootnoteDefinitionInfo[];
}

export function collectFootnotes(doc: MdNode, syntax?: Partial<SyntaxOptions>): Footnotes {
  const definitions = new Map<string, FootnoteDefinitionInfo>();
  walkBlocks(doc, ({ node, path }) => {
    if (node.type !== "footnoteDefinition") return;
    const label = String(node.attrs?.label ?? "");
    const key = normalizeLabel(label);
    if (!definitions.has(key)) definitions.set(key, { label, key, node, path, number: null, references: 0 });
  });
  const references: FootnoteReferenceInfo[] = [];
  const ordered: FootnoteDefinitionInfo[] = [];
  for (const block of textblocks(doc)) {
    walkFragments(inlineFragments(block.text, syntax), (fragment) => {
      if (fragment.type !== "footnoteReference" || !fragment.label) return;
      const label = block.text.slice(fragment.label.from, fragment.label.to);
      const key = normalizeLabel(label);
      const definition = definitions.get(key);
      if (definition && definition.number === null) {
        definition.number = ordered.length + 1;
        ordered.push(definition);
      }
      if (definition) definition.references += 1;
      references.push({
        label,
        key,
        node: block.node,
        path: block.path,
        fragment,
        number: definition?.number ?? null,
        occurrence: definition?.references ?? 0,
      });
    });
  }
  return { definitions, references, ordered };
}

/** 脚注内容的一行摘要（鼠标移上去时显示）：各块的显示文字用空格连起来 */
export function footnoteSummary(definition: MdNode, syntax?: Partial<SyntaxOptions>, isDefined?: (label: string) => boolean): string {
  const parts: string[] = [];
  const visit = (node: MdNode) => {
    if (isTextblock(node.type)) {
      const text = nodeText(node);
      parts.push(plainText(text, inlineFragments(text, syntax, isDefined)));
      return;
    }
    if (node.type === "codeBlock" || node.type === "mathBlock" || node.type === "diagram") {
      parts.push(nodeText(node));
      return;
    }
    for (const child of blockChildren(node)) visit(child);
  };
  for (const child of blockChildren(definition)) visit(child);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
