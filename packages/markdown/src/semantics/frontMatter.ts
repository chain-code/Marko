// Front Matter（B-9）：用 yaml 读出来；typora-root-url 决定图片相对路径的根目录（M-1）
import { parse as parseYaml } from "yaml";
import { blockChildren, nodeText, type MdNode } from "../model.ts";

export interface FrontMatterInfo {
  node: MdNode;
  text: string;
  /** 解析出来的值；YAML 写错时为 undefined，错误在 error 里 */
  data: unknown;
  error: string | null;
  /** typora-root-url 的值 */
  rootUrl: string | null;
}

export function readFrontMatter(doc: MdNode): FrontMatterInfo | null {
  const node = blockChildren(doc)[0];
  if (!node || node.type !== "frontMatter") return null;
  const text = nodeText(node);
  let data: unknown;
  let error: string | null = null;
  try {
    data = text.trim() ? parseYaml(text) : null;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const value = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)["typora-root-url"] : undefined;
  return { node, text, data, error, rootUrl: typeof value === "string" && value.trim() ? value.trim() : null };
}
