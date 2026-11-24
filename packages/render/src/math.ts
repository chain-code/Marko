// 公式（D-1、D-2、D-6）：MathJax 4 渲染成 SVG。整篇按文档顺序一起渲染，编号和 \label、\eqref 才对得上；
// 单个公式（编辑时的预览）按源码缓存。
// 字体里不常用的字符（\mathbb、\mathcal、箭头、★……）在按需加载的文件里（mathFonts.ts）：同步渲染碰到还没加载的，
// 结果标成 pending；先 await loadMathFonts 再渲染就不会碰到（导出前这样做，编辑时见 pending 再加载、重新渲染）
import { liteAdaptor } from "@mathjax/src/mjs/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/mjs/handlers/html.js";
import { TeX } from "@mathjax/src/mjs/input/tex.js";
import "@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/mjs/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/mjs/input/tex/configmacros/ConfigMacrosConfiguration.js";
import "@mathjax/src/mjs/input/tex/mhchem/MhchemConfiguration.js";
import "@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/mjs/input/tex/noundefined/NoUndefinedConfiguration.js";
import "@mathjax/src/mjs/input/tex/physics/PhysicsConfiguration.js";
import "@mathjax/src/mjs/input/tex/textmacros/TextMacrosConfiguration.js";
import { mathjax } from "@mathjax/src/mjs/mathjax.js";
import { SVG } from "@mathjax/src/mjs/output/svg.js";
import { fontFileName, loadFontFile } from "./mathFonts.ts";

/** S-8「公式自动编号」：不编号、只给 AMS 环境编号、所有公式块都编号 */
export type MathNumbering = "none" | "ams" | "all";

export interface MathItem {
  tex: string;
  display: boolean;
}

export interface MathResult {
  /** 渲染出来的 <mjx-container>（出错时也有，MathJax 会把错误画出来） */
  html: string;
  /** 源码有错时的错误信息（D-6） */
  error: string | null;
  /** 用到的字体还没加载：await loadMathFonts 以后重新渲染 */
  pending?: boolean;
}

const PACKAGES = ["base", "ams", "newcommand", "configmacros", "textmacros", "noundefined", "mhchem", "physics"];

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

/** 已经加载过的字体文件 */
const loadedFonts = new Set<string>();

mathjax.asyncLoad = (path: string) => {
  const name = fontFileName(path);
  if (!name) return Promise.reject(new Error(`MathJax 要加载的不是字体文件：${path}`));
  return loadFontFile(name).then(() => {
    loadedFonts.add(name);
  });
};

interface Engine {
  tex: TeX<unknown, unknown, unknown>;
  document: ReturnType<typeof mathjax.document>;
}

function createEngine(numbering: MathNumbering): Engine {
  const tex = new TeX({ packages: PACKAGES, tags: numbering });
  const svg = new SVG({ fontCache: "local" });
  return { tex, document: mathjax.document("", { InputJax: tex, OutputJax: svg }) };
}

interface DynamicFontFile {
  setup(font: FontData): void;
}

interface FontData {
  CLASS: { dynamicFiles: Record<string, DynamicFontFile> };
}

/** 每个字体实例已经装上的字体文件 */
const fontsSetUp = new WeakMap<FontData, Set<string>>();

/**
 * 字体数据是每个 MathJax 实例各一份：已经加载过的字体文件，同步地给这个实例也装上
 * （不装的话它碰到这些字符还要异步走一遍，同步渲染就失败）
 */
function syncFonts(engine: Engine): void {
  const font = (engine.document.outputJax as unknown as { font: FontData }).font;
  const done = fontsSetUp.get(font) ?? new Set<string>();
  for (const name of loadedFonts) {
    if (done.has(name)) continue;
    font.CLASS.dynamicFiles[name]?.setup(font);
    done.add(name);
  }
  fontsSetUp.set(font, done);
}

interface TagState {
  counter: number;
  allLabels: Record<string, unknown>;
}

function tagsOf(engine: Engine): TagState {
  return (engine.tex.parseOptions as unknown as { tags: TagState }).tags;
}

function convert(engine: Engine, item: MathItem): MathResult {
  try {
    const html = adaptor.outerHTML(engine.document.convert(item.tex, { display: item.display }) as never);
    const error = /data-mjx-error="([^"]*)"/.exec(html);
    return { html, error: error ? decodeAttribute(error[1]) : null };
  } catch (cause) {
    // 缺字体：MathJax 抛出带 retry（加载中的 Promise）的错误
    if ((cause as { retry?: unknown }).retry instanceof Promise) return { html: "", error: null, pending: true };
    return { html: "", error: cause instanceof Error ? cause.message : String(cause) };
  }
}

function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const REFERENCE = /\\(?:eq)?ref\s*\{/;

/**
 * 整篇的公式按文档顺序一起渲染：编号连续；\eqref、\ref 能引用后面才出现的 \label
 * （先渲染一遍收集所有标签，再把引用了标签的公式按当时的计数重新渲染）
 */
export function renderMathDocument(items: MathItem[], numbering: MathNumbering = "none"): MathResult[] {
  if (!items.length) return [];
  const engine = createEngine(numbering);
  syncFonts(engine);
  const tags = tagsOf(engine);
  const counters: number[] = [];
  const owned: string[][] = [];
  const results = items.map((item) => {
    counters.push(tags.counter);
    const before = new Set(Object.keys(tags.allLabels));
    const result = convert(engine, item);
    owned.push(Object.keys(tags.allLabels).filter((label) => !before.has(label)));
    return result;
  });
  const labels = { ...tags.allLabels };
  items.forEach((item, index) => {
    if (!REFERENCE.test(item.tex)) return;
    engine.tex.reset(counters[index]);
    const seeded = { ...labels };
    for (const label of owned[index]) delete seeded[label];
    tagsOf(engine).allLabels = seeded;
    results[index] = convert(engine, item);
  });
  return results;
}

let styles: string | null = null;

/** MathJax SVG 输出要配的样式（显示公式居中、上下间距、编号的位置）；导出和编辑区各放一份 */
export function mathStyles(): string {
  if (styles !== null) return styles;
  const engine = createEngine("none");
  const output = (engine.document as unknown as { outputJax: { styleSheet(document: unknown): unknown } }).outputJax;
  styles = adaptor.textContent(output.styleSheet(engine.document) as never);
  return styles;
}

let shared: Engine | null = null;

/** 单个公式用的实例：不编号；永远不让它收到 \def 之类的定义（见 renderMath） */
function sharedEngine(): Engine {
  shared ??= createEngine("none");
  syncFonts(shared);
  return shared;
}

/** \def、\newcommand 之类：定义会留在 MathJax 实例里，影响之后在这个实例里渲染的公式 */
const DEFINITION = /\\(?:g|e|x)?def(?![a-zA-Z])|\\let(?![a-zA-Z])|\\(?:re)?newcommand|\\providecommand|\\(?:re)?newenvironment|\\DeclareMathOperator|\\Newextarrow/;

/**
 * 把这些公式要用的字体都加载好，之后同步渲染就不会再碰到 pending。
 * 用一个一次性的实例：公式里的定义不留到别处。源码本身有错不影响（MathJax 把错误画出来，不抛异常）；
 * 字体文件加载失败时这个公式渲染时报错
 */
export async function loadMathFonts(items: Iterable<MathItem>): Promise<void> {
  const engine = createEngine("none");
  for (const item of items) {
    syncFonts(engine);
    try {
      await mathjax.handleRetriesFor(() => {
        engine.tex.reset(0);
        engine.document.convert(item.tex, { display: item.display });
      });
    } catch {
      // 字体文件加载失败：MathJax 已在控制台警告，渲染时这个公式会报错
    }
  }
}

const cache = new Map<string, MathResult>();
const CACHE_LIMIT = 500;

/**
 * 单个公式（编辑时的行内 Widget、公式块预览）；按源码缓存。不编号、不处理引用。
 * 结果只取决于这个公式自己：带定义的公式用一次性的实例渲染，定义不留给别的公式（整篇按顺序生效的定义见 renderMathDocument）
 */
export function renderMath(tex: string, display: boolean): MathResult {
  const key = `${display ? "D" : "I"}${tex}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  let engine: Engine;
  if (DEFINITION.test(tex)) {
    engine = createEngine("none");
    syncFonts(engine);
  } else {
    engine = sharedEngine();
  }
  engine.tex.reset(0);
  const result = convert(engine, { tex, display });
  // 缺字体的不缓存：加载完再渲染就好了
  if (result.pending) return result;
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return result;
}
