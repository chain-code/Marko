// 测试共用：schema、语料
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getSchema } from "@tiptap/core";
import { markdownNodes } from "../src/nodes/index.ts";

/** 测试总是在 packages/editor 下跑（jsdom 环境里 import.meta.url 不是 file: 地址） */
export const repo = resolve(process.cwd(), "..", "..");

export const schema = getSchema(markdownNodes);

export interface CorpusCase {
  name: string;
  source: string;
}

/** test/corpus/ 的无损语料：两份规范的全部例子和真实文档 */
export function corpusCases(): CorpusCase[] {
  const corpus = join(repo, "test", "corpus");
  const spec = (file: string, label: string) =>
    (JSON.parse(readFileSync(join(corpus, file), "utf8")) as Array<{ markdown: string; example: number }>).map((example) => ({
      name: `${label} #${example.example}`,
      source: example.markdown,
    }));
  const documents = readdirSync(join(corpus, "documents"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ name: `documents/${name}`, source: readFileSync(join(corpus, "documents", name), "utf8") }));
  return [...spec("commonmark-0.31.2.json", "CommonMark"), ...spec("gfm-0.29.json", "GFM"), ...documents];
}
