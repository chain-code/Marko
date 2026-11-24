// 读 test/corpus/ 的无损语料（阶段 0 准备的）：两份规范的全部例子和真实文档
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const corpusDir = fileURLToPath(new URL("../../../test/corpus/", import.meta.url));

export interface CorpusCase {
  name: string;
  source: string;
}

function specCases(file: string, label: string): CorpusCase[] {
  const examples = JSON.parse(readFileSync(join(corpusDir, file), "utf8")) as Array<{ markdown: string; example: number; section: string }>;
  return examples.map((example) => ({ name: `${label} #${example.example}（${example.section}）`, source: example.markdown }));
}

export function corpusCases(): CorpusCase[] {
  const documentsDir = join(corpusDir, "documents");
  const documents = readdirSync(documentsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ name: `documents/${name}`, source: readFileSync(join(documentsDir, name), "utf8") }));
  return [...specCases("commonmark-0.31.2.json", "CommonMark"), ...specCases("gfm-0.29.json", "GFM"), ...documents];
}
