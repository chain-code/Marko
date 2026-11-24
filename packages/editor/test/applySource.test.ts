// 按源码改动（source.ts 的 applySource：源码模式的每次输入、按源码改的命令）：随机在真实文档的源码里插入、删除，
// 应用以后文档的源码（光标所在的空段落也输出，同源码模式看到的）要正好是改后的源码，逐字节不变。种子固定，失败时能重现
import type { Editor } from "@tiptap/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, setMarkdown } from "../src/index.ts";
import { applySource, readSource } from "../src/source.ts";
import { repo } from "./helpers.ts";

const SEED = Number(process.env.MARKO_FUZZ_SEED ?? 20261124);
const STEPS = Number(process.env.MARKO_FUZZ_STEPS ?? 150);

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKENS = ["a", "中", " ", "  ", "\n", "\n\n", "> ", ">", "- ", "* ", "1. ", "# ", "#", "```", "~~~", "$$", "|", "| a |", "---", "===", ":", ": ", "[^1]: ", "<div>", "</div>", "<!--", "-->", "\t", "[ ] ", "[!NOTE]", "    "];

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

const DOCUMENTS = ["sample-document.md", "nested-structures.md", "edge-cases.md", "table-heavy.md", "math-heavy.md"];

describe("随机按源码改动", () => {
  for (const [index, name] of DOCUMENTS.entries()) {
    it(`${name}：应用以后文档的源码正好是改后的源码`, () => {
      editor = createMarkoEditor();
      setMarkdown(editor, readFileSync(join(repo, "test", "corpus", "documents", name), "utf8"));
      const next = random(SEED + index);
      const syntax = editor.storage.marko.syntax;
      for (let step = 0; step < STEPS; step += 1) {
        const before = readSource(editor.state);
        const text = before.text;
        const at = Math.floor(next() * (text.length + 1));
        let changed: string;
        let cursor: number;
        let action: string;
        if (next() < 0.65 || text.length === 0) {
          const token = TOKENS[Math.floor(next() * TOKENS.length)];
          changed = text.slice(0, at) + token + text.slice(at);
          cursor = at + token.length;
          action = `在 ${at} 插入 ${JSON.stringify(token)}`;
        } else {
          const end = Math.min(text.length, at + 1 + Math.floor(next() * 5));
          changed = text.slice(0, at) + text.slice(end);
          cursor = at;
          action = `删掉 ${at}～${end} ${JSON.stringify(text.slice(at, end))}`;
        }
        const context = () => `第 ${step} 步：${action}\n改之前 ${JSON.stringify(text.slice(Math.max(0, at - 50), at + 50))}`;
        let tr;
        try {
          tr = applySource(editor.state, before, { text: changed, anchor: cursor, head: cursor }, { syntax });
        } catch (error) {
          throw new Error(`${context()}\n出错：${(error as Error).message}`);
        }
        editor.view.dispatch(tr);
        const after = readSource(editor.state).text;
        if (after !== changed) {
          let first = 0;
          while (first < changed.length && changed[first] === after[first]) first += 1;
          throw new Error(`${context()}\n应该是 ${JSON.stringify(changed.slice(Math.max(0, first - 50), first + 50))}\n实际是 ${JSON.stringify(after.slice(Math.max(0, first - 50), first + 50))}`);
        }
      }
    });
  }
});
