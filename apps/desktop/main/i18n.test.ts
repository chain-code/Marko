// L-2 界面文字：每种语言的翻译和中文结构相同、每条消息都能解析；特殊字符（| $ { }）原样显示
import { compile } from "@intlify/core-base";
import { afterEach, describe, expect, it } from "vitest";
import { availableLocales, DEFAULT_LOCALE, LOCALES, localeOf } from "../locales/index.ts";
import { setLocale, t } from "./i18n.ts";

type Tree = { [key: string]: string | Tree };

/** 所有叶子的路径 */
function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [child, text] of leaves(value, path)) out.set(child, text);
  }
  return out;
}

afterEach(() => setLocale(DEFAULT_LOCALE));

describe("L-2 界面文字", () => {
  it("中文是默认语言；每种语言的条目和中文一一对应，没有空的", () => {
    expect(Object.keys(LOCALES)).toContain(DEFAULT_LOCALE);
    expect(availableLocales()[0]).toEqual({ code: DEFAULT_LOCALE, name: "中文" });
    const reference = [...leaves(LOCALES[DEFAULT_LOCALE] as unknown as Tree).keys()].sort();
    for (const [code, messages] of Object.entries(LOCALES)) {
      const entries = leaves(messages as unknown as Tree);
      expect([...entries.keys()].sort(), code).toEqual(reference);
      for (const [path, text] of entries) expect(text.trim(), `${code} ${path}`).not.toBe("");
    }
    expect(localeOf("xx-YY")).toBe(DEFAULT_LOCALE);
  });

  it("每条消息都能解析（写法错了的会在这里报出来）", () => {
    for (const [code, messages] of Object.entries(LOCALES)) {
      for (const [path, text] of leaves(messages as unknown as Tree)) {
        const errors: string[] = [];
        compile(text, { key: path, locale: code, onError: (error) => errors.push(error.message) });
        expect(errors, `${code} ${path}：${text}`).toEqual([]);
      }
    }
  });

  it("参数换进去；消息写法里的特殊字符原样显示", () => {
    expect(t("app.version", { version: "2.0.0" })).toBe("版本 2.0.0");
    expect(t("files.invalidName")).toBe('名字里不能有 < > : " / \\ | ? *');
    expect(t("settings.option.imageInsertAction.documentAssets")).toBe("复制图片到 ./${filename}.assets 文件夹");
    expect(t("confirm.recentMissing.message", { message: "文件不存在", path: "C:\\a.md" })).toBe("文件不存在：\nC:\\a.md\n\n要从最近文件里去掉它吗？");
  });
});

describe("L-2 English", () => {
  it("换成 English 后用英文；带撇号、引号、特殊字符的照样；回到中文", () => {
    setLocale("en");
    expect(t("common.dontSave")).toBe("Don't Save");
    expect(t("files.invalidName")).toBe(String.raw`Names can't contain < > : " / \ | ? *`);
    expect(t("document.deletedTitle", { title: "a.md" })).toBe("a.md (deleted)");
    expect(t("settings.option.imageInsertAction.documentAssets")).toBe("Copy image to ./${filename}.assets folder");
    expect(t("files.revealIn", { manager: "Finder" })).toBe("Reveal in Finder");
    expect(availableLocales().map((locale) => locale.code)).toEqual(["zh-CN", "en"]);
    setLocale("zh-CN");
    expect(t("document.deletedTitle", { title: "a.md" })).toBe("a.md（已删除）");
  });
});
