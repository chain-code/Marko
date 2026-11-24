// 视觉对照用（阶段 3、test/visual/README.md）：把 test/visual/corpus 按 Typora 截图时同样的切法渲染成自包含的 HTML。
// 只在设了 MARKO_VISUAL_OUT（输出目录）时跑：MARKO_VISUAL_OUT=<目录> npx vitest run test/visual-export.test.ts
// 截图用 test/visual/marko-capture.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "@marko/markdown";
import { it } from "vitest";
import { cleanDiagramSvg, type DiagramKind, type DiagramResult, type DiagramTheme } from "../src/diagrams.ts";
import { exportDocument } from "../src/exportDocument.ts";

const outDir = process.env.MARKO_VISUAL_OUT;
// jsdom 环境里 import.meta.url 不是 file: 地址；测试总是在 packages/render 下跑
const repo = resolve(process.cwd(), "..", "..");
const corpusDir = join(repo, "test", "visual", "corpus");
const themesDir = join(repo, "packages", "themes");

/** 同 test/visual/typora-capture.mjs：按「## 」切段；有 Front Matter 的文件不切 */
function splitIntoChunks(text: string): string[] {
  if (text.startsWith("---")) return [text];
  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^## /.test(line) && current.some((item) => item.trim())) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.some((item) => item.trim())) chunks.push(current.join("\n"));
  return chunks;
}

/** 字体内嵌成 data URI，导出的文件才是自包含的 */
function themeCss(theme: string): string {
  const fontsCss = readFileSync(join(themesDir, "fonts", "open-sans.css"), "utf8").replace(/url\("\.\/([^"]+)"\)/g, (_match: string, file: string) => {
    const data = readFileSync(join(themesDir, "fonts", file)).toString("base64");
    return `url("data:font/woff2;base64,${data}")`;
  });
  const themeFile = readFileSync(join(themesDir, "themes", `${theme}.css`), "utf8").replace(/@import[^;]+;/g, "");
  return [fontsCss, readFileSync(join(themesDir, "base.css"), "utf8"), themeFile, "body { margin: 0; background: var(--md-background); }"].join("\n");
}

/**
 * 图表：test/visual/render-diagrams.mjs 在真的沙箱里画好、存在 <输出目录>/diagrams.json 里的 SVG。
 * 没画过的记进 diagram-requests.json，交给它画，画完再跑一遍本测试
 */
function diagramsFrom(target: string) {
  const file = join(target, "diagrams.json");
  const rendered: Record<string, { svg?: string; error?: string }> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const missing = new Map<string, { kind: DiagramKind; source: string; theme: DiagramTheme }>();
  async function renderDiagram(kind: DiagramKind, source: string, theme: DiagramTheme): Promise<DiagramResult> {
    const key = `${theme}\n${kind}\n${source}`;
    const hit = rendered[key];
    // 同 DiagramRenderer：沙箱回来的 SVG 先过滤。Mermaid 的配色在 <style> 里，过滤后不能变空（diagramStyle.ts）
    if (hit?.svg !== undefined) {
      const svg = cleanDiagramSvg(hit.svg);
      if (svg === null) throw new Error(`图表沙箱返回的不是 SVG：${kind}\n${source}`);
      if (/<style>[^<]/.test(hit.svg) && !/<style>[^<]/.test(svg)) throw new Error(`图表的 <style> 被过滤掉了：${kind}\n${source}`);
      return { svg };
    }
    if (hit) return { error: hit.error ?? "图表渲染失败" };
    missing.set(key, { kind, source, theme });
    return { error: "还没画：先跑 test/visual/render-diagrams.mjs" };
  }
  return { renderDiagram, missing };
}

it.skipIf(!outDir)("把视觉语料渲染成 HTML", async () => {
  const target = outDir as string;
  mkdirSync(target, { recursive: true });
  cpSync(join(corpusDir, "assets"), join(target, "assets"), { recursive: true });
  const { renderDiagram, missing } = diagramsFrom(target);
  for (const theme of ["solo", "dark"]) {
    const css = themeCss(theme);
    for (const file of readdirSync(corpusDir).filter((name) => name.endsWith(".md")).sort()) {
      const name = basename(file, ".md");
      const chunks = splitIntoChunks(readFileSync(join(corpusDir, file), "utf8"));
      for (const [index, chunk] of chunks.entries()) {
        // 和 Typora 对照图一样用默认设置（高亮、上下标关着）
        const html = await exportDocument(parse(chunk), { title: name, css, theme: theme === "dark" ? "dark" : "light", renderDiagram });
        writeFileSync(join(target, `${theme}-${name}-${String(index + 1).padStart(2, "0")}.html`), html);
      }
    }
  }
  const requests = join(target, "diagram-requests.json");
  if (missing.size) {
    writeFileSync(requests, JSON.stringify([...missing.values()], null, 2));
    console.log(`有 ${missing.size} 张图还没画：node test/visual/render-diagrams.mjs ${target}，然后再跑一遍`);
  } else {
    rmSync(requests, { force: true });
  }
}, 120_000);
