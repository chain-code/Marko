// MathJax 4 的字体（mathjax-newcm）把不常用的字符分在 40 个文件里：\mathbb、\mathcal、\mathfrak、\mathscr、
// \mathsf、\mathtt、箭头、★、✓……用到时才加载。这里列出每个文件的动态 import，打包时各成一块，不用的不会加载。
// 文件 import 进来时自己往字体类上登记（MathJaxNewcmFont.dynamicSetup），所以字体包必须和 @mathjax/src
// 用的是同一份（package.json 里两个都锁定精确版本，npm ls 里应是 deduped；math.test.ts 里有测试兜底）
const font = {
  PUA: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js"),
  "accents-b-i": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js"),
  accents: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js"),
  arabic: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js"),
  arrows: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js"),
  "braille-d": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js"),
  braille: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js"),
  calligraphic: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js"),
  cherokee: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js"),
  "cyrillic-ss": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js"),
  cyrillic: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js"),
  devanagari: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js"),
  "double-struck": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js"),
  fraktur: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js"),
  "greek-ss": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js"),
  greek: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js"),
  hebrew: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js"),
  "latin-b": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js"),
  "latin-bi": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js"),
  "latin-i": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js"),
  latin: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js"),
  marrows: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js"),
  math: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js"),
  "monospace-ex": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js"),
  "monospace-l": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js"),
  monospace: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js"),
  mshapes: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js"),
  "phonetics-ss": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js"),
  phonetics: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js"),
  "sans-serif-b": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js"),
  "sans-serif-bi": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js"),
  "sans-serif-ex": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js"),
  "sans-serif-i": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js"),
  "sans-serif-r": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js"),
  "sans-serif": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js"),
  script: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js"),
  shapes: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js"),
  "symbols-b-i": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js"),
  symbols: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js"),
  variants: () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js"),
} satisfies Record<string, () => Promise<unknown>>;

const FONT_FILES: Record<string, () => Promise<unknown>> = font;

/** MathJax 要加载的文件名（「@mathjax/mathjax-newcm-font/svg/dynamic/arrows.js」）→ 文件里的名字（arrows）；不是字体文件返回 null */
export function fontFileName(path: string): string | null {
  const name = /\/svg\/dynamic\/([\w-]+)\.js$/.exec(path)?.[1];
  return name && Object.hasOwn(FONT_FILES, name) ? name : null;
}

/** 加载一个字体文件（import 进来时它自己往字体类上登记） */
export function loadFontFile(name: string): Promise<unknown> {
  return FONT_FILES[name]();
}
