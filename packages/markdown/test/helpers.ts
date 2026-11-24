// 测试用的工具：去掉出身的深拷贝、比较结构
import { isLeaf, nodeText, type MdNode, type MdText } from "../src/model.ts";

/** 深拷贝成新对象：新对象没有出身，序列化时全部按写法属性重新生成 */
export function withoutOrigins(node: MdNode): MdNode {
  const copy: MdNode = { type: node.type };
  if (node.attrs) copy.attrs = structuredClone(node.attrs);
  if (node.content) {
    copy.content = node.content.map((child) =>
      child.type === "text" ? { type: "text", text: (child as MdText).text } : withoutOrigins(child as MdNode),
    );
  }
  return copy;
}

/** 结构的文字形式：类型、写法属性、文字，用来比较两棵树 */
export function outline(node: MdNode, ignore: readonly string[] = []): unknown {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.attrs ?? {})) if (!ignore.includes(key)) attrs[key] = value;
  if (isLeaf(node.type)) return { type: node.type, attrs, text: nodeText(node) };
  return {
    type: node.type,
    attrs,
    content: (node.content ?? []).filter((child) => child.type !== "text").map((child) => outline(child as MdNode, ignore)),
  };
}
