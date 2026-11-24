// 链接引用定义（B-15）：`[id]: 地址 "标题"`。文中的 `[文字][id]`、`[文字][]`、`[id]` 按它解析，同名的只认第一个
import { decodeHTML } from "entities";
import type { Fragment } from "../inline.ts";
import { nodeText, type MdNode } from "../model.ts";
import { blockParser, resolveSyntax, type SyntaxOptions } from "../syntax/index.ts";
import { normalizeLabel } from "./labels.ts";
import { walkBlocks } from "./walk.ts";

export interface ReferenceDefinitionSyntax {
  label: string;
  url: string;
  title: string | null;
}

export interface ReferenceDefinitionInfo extends ReferenceDefinitionSyntax {
  key: string;
  node: MdNode;
  path: number[];
}

/** 反斜杠转义和实体（CommonMark：地址和标题里都要解开） */
export function unescapeMarkdown(text: string): string {
  return decodeHTML(text.replace(/\\([!-/:-@[-`{-~])/g, "$1"));
}

/** 读一条链接引用定义的原文；不是合法的定义时返回 null */
export function parseReferenceDefinition(text: string, syntax?: Partial<SyntaxOptions>): ReferenceDefinitionSyntax | null {
  const tree = blockParser(resolveSyntax(syntax)).parse(text);
  const definition = tree.topNode.firstChild;
  if (!definition || definition.name !== "LinkReference") return null;
  let label: string | null = null;
  let url = "";
  let title: string | null = null;
  for (let child = definition.firstChild; child; child = child.nextSibling) {
    const raw = text.slice(child.from, child.to);
    if (child.name === "LinkLabel") label = raw.slice(1, -1);
    else if (child.name === "URL") url = unescapeMarkdown(raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw);
    else if (child.name === "LinkTitle") title = unescapeMarkdown(raw.slice(1, -1));
  }
  return label === null ? null : { label, url, title };
}

export function collectReferences(doc: MdNode, syntax?: Partial<SyntaxOptions>): Map<string, ReferenceDefinitionInfo> {
  const result = new Map<string, ReferenceDefinitionInfo>();
  walkBlocks(doc, ({ node, path }) => {
    if (node.type !== "referenceDefinition") return;
    const definition = parseReferenceDefinition(nodeText(node), syntax);
    if (!definition) return;
    const key = normalizeLabel(definition.label);
    if (!result.has(key)) result.set(key, { ...definition, key, node, path });
  });
  return result;
}

/** 引用式链接、图片指向的定义；行内链接、找不到定义时返回 null */
export function resolveReference(
  text: string,
  fragment: Fragment,
  references: Map<string, ReferenceDefinitionInfo>,
): ReferenceDefinitionInfo | null {
  if ((fragment.type !== "link" && fragment.type !== "image") || fragment.url || !fragment.label) return null;
  return references.get(normalizeLabel(text.slice(fragment.label.from, fragment.label.to))) ?? null;
}

/** 「这个标签有没有定义」，传给 inlineFragments，让没定义的引用式链接按普通文字处理 */
export function referenceChecker(references: Map<string, ReferenceDefinitionInfo>): (label: string) => boolean {
  return (label) => references.has(normalizeLabel(label));
}
