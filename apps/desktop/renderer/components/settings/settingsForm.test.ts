// L-2：偏好设置的文字按设置名拼路径取（类型检查管不到），这里查每种语言里每一节、每一组、每一项、每个选项都有文字
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "../../../locales/index.ts";
import { setLocale } from "../../i18n.ts";
import { allFields, fieldHint, fieldLabel, groupLabel, optionLabel, SECTIONS, sectionLabel, sectionMatches, valueOf } from "./settingsForm.ts";
import { DEFAULT_SETTINGS } from "@marko/shared";

afterEach(() => setLocale(DEFAULT_LOCALE));

describe("S 章偏好设置的文字（L-2）", () => {
  it("每种语言里每一节、每一组、每一项、每个选项都有文字", () => {
    for (const code of Object.keys(LOCALES)) {
      setLocale(code);
      for (const section of SECTIONS) {
        expect(sectionLabel(section), `${code} 节 ${section.id}`).not.toBe(section.id);
        for (const group of section.groups) {
          expect(groupLabel(group), `${code} 组 ${group.id}`).not.toBe(group.id);
          for (const field of group.fields) {
            expect(fieldLabel(field), `${code} ${field.key}`).not.toBe(field.key);
            for (const option of field.options ?? []) {
              if (field.format === "raw") continue;
              expect(optionLabel(field, option), `${code} ${field.key}=${String(option)}`).not.toBe(String(option));
            }
          }
        }
      }
    }
  });

  it("中文的几项：说明只在写了的项下面显示；选项按格式套上值", () => {
    const field = (key: string) => allFields().find((item) => item.key === key)!;
    expect(fieldLabel(field("extensions.math"))).toBe("公式块");
    expect(fieldLabel(field("autoPair"))).toBe("匹配括号和引号");
    expect(fieldLabel(field("clearRecent"))).toBe("清除历史文件记录");
    expect(fieldHint(field("autoPair"))).toBe("输入括号、引号时补上另一半");
    expect(fieldHint(field("fontSize"))).toBeNull();
    expect(optionLabel(field("startup"), "blank")).toBe("打开新文件");
    expect(optionLabel(field("autoSaveIntervalMinutes"), 5)).toBe("5 分钟");
    expect(optionLabel(field("autoNumberingForMath"), false)).toBe("不启用公式的自动编号");
    expect(optionLabel(field("preserveSingleLineBreaks"), true)).toBe("保留单个换行");
    expect(optionLabel(field("indentSize"), 2)).toBe("2");
    expect(optionLabel(field("spellcheckLanguages"), "en-US")).toBe("英语（美国）");
    expect(optionLabel(field("language"), "zh-CN")).toBe("中文");
    expect(optionLabel(field("pdfPageSize"), "A4")).toBe("A4");
    // 每一项都对得上一个设置（写错名字的项在这里查出来）
    for (const item of allFields()) {
      // Token、用户词典、按钮不是设置项
      if (item.kind !== "token" && item.kind !== "dictionary" && item.kind !== "button") expect(valueOf(DEFAULT_SETTINGS, item.key), item.key).not.toBeUndefined();
    }
  });

  it("查找（同 Typora）：按节名、组名、设置项的名字和说明找", () => {
    const section = (id: string) => SECTIONS.find((item) => item.id === id)!;
    expect(sectionMatches(section("file"), "自动保存")).toBe(true);
    expect(sectionMatches(section("editor"), "自动保存")).toBe(false);
    expect(sectionMatches(section("appearance"), "主题")).toBe(true);
    expect(sectionMatches(section("markdown"), "MERMAID")).toBe(true);
    expect(sectionMatches(section("general"), "")).toBe(false);
  });
});
