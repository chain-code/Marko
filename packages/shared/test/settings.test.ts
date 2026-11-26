import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsPatchSchema, applySettingsPatch, normalizeSettings } from "../src/index.ts";

describe("设置（S 章、1.8 节）", () => {
  it("默认值同第 2 章的表（同 Typora 1.14.17 的默认值）", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("solo");
    expect(DEFAULT_SETTINGS.autoSaveIntervalMinutes).toBe(3);
    expect(DEFAULT_SETTINGS.startup).toBe("blank");
    expect(DEFAULT_SETTINGS.autoSave).toBe(false);
    expect(DEFAULT_SETTINGS.saveOnFileSwitch).toBe(false);
    expect(DEFAULT_SETTINGS.collapsibleOutline).toBe(false);
    expect(DEFAULT_SETTINGS.copyMarkdownAsPlainText).toBe(true);
    expect(DEFAULT_SETTINGS.smartQuotes).toBe(false);
    expect(DEFAULT_SETTINGS.smartDashes).toBe(false);
    expect(DEFAULT_SETTINGS.preserveSingleLineBreaks).toBe(true);
    expect(DEFAULT_SETTINGS.codeWrap).toBe(true);
    expect(DEFAULT_SETTINGS.readingSpeed).toBe(382);
    expect(DEFAULT_SETTINGS.extensions.highlight).toBe(false);
    expect(DEFAULT_SETTINGS.extensions.math).toBe(true);
    expect(DEFAULT_SETTINGS.extensions.inlineMath).toBe(false);
    expect(DEFAULT_SETTINGS.imageInsertAction).toBe("none");
    expect(DEFAULT_SETTINGS.escapeImageUrls).toBe(false);
    expect(DEFAULT_SETTINGS.spellcheckLanguages).toEqual(["en-US"]);
  });

  it("读到旧版本存的、缺字段、手改坏了的设置：能用的留下，缺的、坏的用默认值", () => {
    const settings = normalizeSettings({ fontSize: 18, autoSaveIntervalMinutes: 7, theme: "", extensions: { html: false }, unknown: 1 });
    expect(settings.fontSize).toBe(18);
    expect(settings.autoSaveIntervalMinutes).toBe(3);
    expect(settings.theme).toBe("solo");
    expect(settings.extensions.html).toBe(false);
    expect(settings.extensions.math).toBe(true);
    expect("unknown" in settings).toBe(false);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("部分设置合并：extensions 按项合并；校验不过的拒绝", () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { fontSize: 20, extensions: { highlight: true } });
    expect(next.fontSize).toBe(20);
    expect(next.extensions.highlight).toBe(true);
    expect(next.extensions.html).toBe(true);
    expect(SettingsPatchSchema.safeParse({ fontSize: "big" }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ extensions: { html: false } }).success).toBe(true);
  });

  it("解析改设置时给的部分：没给的字段不补默认值（不然改一项会把别的都恢复成默认）", () => {
    expect(SettingsPatchSchema.parse({ fontSize: 20 })).toEqual({ fontSize: 20 });
    expect(SettingsPatchSchema.parse({ extensions: { html: false } })).toEqual({ extensions: { html: false } });
    expect(SettingsPatchSchema.parse({})).toEqual({});
    // 主进程按解析结果合并：改字体大小以后，之前关掉的状态栏还是关着
    const hidden = applySettingsPatch(DEFAULT_SETTINGS, SettingsPatchSchema.parse({ showStatusBar: false }));
    const next = applySettingsPatch(hidden, SettingsPatchSchema.parse({ fontSize: 20 }));
    expect(next).toMatchObject({ showStatusBar: false, fontSize: 20 });
    expect(SettingsPatchSchema.safeParse({ autoSaveIntervalMinutes: 2 }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ extensions: { html: "yes" } }).success).toBe(false);
  });
});
