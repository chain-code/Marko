// 外观（A 章、1.11 节）：主题文件的 :root 变量整页只能有一份，换主题时替换同一个 <style>；
// 深色时给 <html> 加 dark 类（Element Plus 的暗色变量跟着生效）。应用的设置 → 编辑器组件的设置（同名的直接用）。
// 用户主题（A-3）从 marko-theme://local/<文件> 加载（Typora 的主题按相对路径引用自己目录里的字体、子样式表，都在这个地址下面），
// 叠在 SoloLog 浅色上面（用户主题没定义的变量照样有值）；主题目录里的 user.css 加在任何主题后面
import type { Settings, ThemeList } from "@marko/shared";
import type { EditorSettings } from "@marko/editor-vue";
import dark from "@marko/themes/themes/dark.css?inline";
import solo from "@marko/themes/themes/solo.css?inline";
import { ref } from "vue";
import { editorKeyBindings, isMacPlatform } from "./shortcuts.ts";

const BUILT_IN: Record<string, { css: string; dark: boolean }> = {
  solo: { css: solo, dark: false },
  dark: { css: dark, dark: true },
};

const USER_PREFIX = "user:";

/** 现在的主题是不是深色：内置的按定义；用户主题加载以后看编辑区的底色 */
export const themeDark = ref(false);

/** 现在用哪个主题（A-4「跟随系统深浅色」开着时按系统选） */
export function activeTheme(settings: Settings, systemDark: boolean): string {
  if (settings.followSystemTheme) return systemDark ? settings.darkTheme : settings.lightTheme;
  return settings.theme;
}

function themeUrl(file: string, version: number): string {
  return `marko-theme://local/${encodeURIComponent(file)}?v=${version}`;
}

/** 用户主题的文件名；不是用户主题、主题目录里已经没有它了是 null */
function userThemeFile(name: string, list: ThemeList | null): string | null {
  if (!name.startsWith(USER_PREFIX) || !list?.themes.some((theme) => theme.id === name)) return null;
  return name.slice(USER_PREFIX.length);
}

function setDark(value: boolean): void {
  themeDark.value = value;
  document.documentElement.classList.toggle("dark", value);
}

/** 用户主题加载完：按编辑区（没有时整页）的底色判断深浅 */
function detectDark(): void {
  for (const element of [document.querySelector("#write"), document.body]) {
    if (!element) continue;
    const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(element).backgroundColor);
    if (!match || (match[4] !== undefined && Number(match[4]) === 0)) continue;
    const [r, g, b] = [match[1], match[2], match[3]].map(Number);
    setDark((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45);
    return;
  }
  setDark(false);
}

function element<T extends HTMLElement>(id: string, tag: string): T {
  let found = document.getElementById(id) as T | null;
  if (!found) {
    found = document.createElement(tag) as T;
    found.id = id;
    document.head.append(found);
  }
  return found;
}

/** 换主题：内置的直接写进 <style>；用户主题叠在 SoloLog 浅色上面；最后是 user.css */
export function applyTheme(name: string, list: ThemeList | null): void {
  const style = element<HTMLStyleElement>("marko-theme", "style");
  const file = userThemeFile(name, list);
  const base = file ? BUILT_IN.solo : (BUILT_IN[name] ?? BUILT_IN.solo);
  if (style.textContent !== base.css) style.textContent = base.css;
  const link = document.getElementById("marko-theme-link") as HTMLLinkElement | null;
  if (file && list) {
    const themeLink = link ?? element<HTMLLinkElement>("marko-theme-link", "link");
    themeLink.rel = "stylesheet";
    themeLink.onload = detectDark;
    const href = themeUrl(file, list.version);
    if (themeLink.getAttribute("href") !== href) themeLink.href = href;
  } else {
    link?.remove();
    setDark(base.dark);
  }
  // user.css 在主题后面（重新插到最后，保证顺序）
  const userLink = document.getElementById("marko-user-css") as HTMLLinkElement | null;
  if (list?.userCss) {
    const target = userLink ?? document.createElement("link");
    target.id = "marko-user-css";
    target.rel = "stylesheet";
    const href = themeUrl("user.css", list.version);
    if (target.getAttribute("href") !== href) target.href = href;
    document.head.append(target);
  } else userLink?.remove();
}

/**
 * 导出、打印用的主题 CSS（通用规则 2：和编辑区一样）：用户主题、user.css 由 read 给（主进程把 @import 展开、字体图片转成 data URI，
 * 导出的文件离开主题目录也是一样的样子，A-3）
 */
export async function exportTheme(name: string, list: ThemeList | null, read: (file: string) => Promise<string>): Promise<{ css: string; dark: boolean }> {
  const file = userThemeFile(name, list);
  const parts = [file ? BUILT_IN.solo.css : (BUILT_IN[name] ?? BUILT_IN.solo).css];
  if (file) parts.push(await read(file));
  if (list?.userCss) parts.push(await read("user.css"));
  return { css: parts.filter(Boolean).join("\n"), dark: file ? themeDark.value : (BUILT_IN[name] ?? BUILT_IN.solo).dark };
}

/** 编辑器组件（K-1 的 EditorSettings）用的设置 */
export function editorSettingsOf(settings: Settings, dark: boolean, sourceMode: boolean): Partial<EditorSettings> {
  return {
    theme: dark ? "dark" : "solo",
    fontSize: settings.fontSize,
    lineWidth: settings.lineWidth,
    spellcheck: settings.spellcheck,
    sourceMode,
    focusMode: settings.focusMode,
    typewriterMode: settings.typewriterMode,
    typewriterCenter: settings.typewriterCenter,
    indentSize: settings.indentSize,
    codeIndentSize: settings.codeIndentSize,
    shiftTabAutoIndent: settings.shiftTabAutoIndent,
    autoPair: settings.autoPair,
    emojiAutocomplete: settings.emojiAutocomplete,
    copyMarkdownAsPlainText: settings.copyMarkdownAsPlainText,
    preserveSingleLineBreaks: settings.preserveSingleLineBreaks,
    smartQuotes: settings.smartQuotes,
    smartDashes: settings.smartDashes,
    autoNumberingForMath: settings.autoNumberingForMath,
    codeLineNumbers: settings.codeLineNumbers,
    codeWrap: settings.codeWrap,
    defaultCodeLanguage: settings.defaultCodeLanguage,
    defaultCodeLanguageApplyTo: settings.defaultCodeLanguageApplyTo,
    defaultLineEnding: settings.defaultLineEnding,
    extensions: { ...settings.extensions, marks: false },
    // S-12：编辑区里的快捷键和菜单一致；视图模式这几个交给菜单
    keyBindings: editorKeyBindings(settings.keyBindings, isMacPlatform()),
  };
}
