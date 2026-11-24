// L-2：偏好设置的文字按设置名拼路径取（类型检查管不到），这里查每种语言里每一节、每一项、每个选项都有文字
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "../../../locales/index.ts";
import { setLocale } from "../../i18n.ts";
import { fieldHint, fieldLabel, optionLabel, SECTIONS, sectionLabel, valueOf } from "./settingsForm.ts";
import { DEFAULT_SETTINGS } from "@marko/shared";

afterEach(() => setLocale(DEFAULT_LOCALE));

describe("S 章偏好设置的文字（L-2）", () => {
  it("每种语言里每一节、每一项、每个选项都有文字", () => {
    for (const code of Object.keys(LOCALES)) {
      setLocale(code);
      for (const section of SECTIONS) {
        expect(sectionLabel(section), `${code} 节 ${section.id}`).not.toBe(section.id);
        for (const field of section.fields) {
          expect(fieldLabel(field), `${code} ${field.key}`).not.toBe(field.key);
          for (const option of field.options ?? []) {
            if (field.format === "raw") continue;
            expect(optionLabel(field, option), `${code} ${field.key}=${String(option)}`).not.toBe(String(option));
          }
        }
      }
    }
  });

  it("中文的几项：说明只在写了的项下面显示；选项按格式套上值", () => {
    const field = (key: string) => SECTIONS.flatMap((section) => section.fields).find((item) => item.key === key)!;
    expect(fieldLabel(field("extensions.math"))).toBe("公式");
    expect(fieldHint(field("autoPair"))).toBe("输入括号、引号时补上另一半");
    expect(fieldHint(field("fontSize"))).toBeNull();
    expect(optionLabel(field("autoSaveIntervalMinutes"), 5)).toBe("5 分钟");
    expect(optionLabel(field("autoNumberingForMath"), false)).toBe("不编号");
    expect(optionLabel(field("spellcheckLanguages"), "en-US")).toBe("英语（美国）");
    expect(optionLabel(field("language"), "zh-CN")).toBe("中文");
    expect(optionLabel(field("pdfPageSize"), "A4")).toBe("A4");
    // 每一项都对得上一个设置（写错名字的项在这里查出来）
    for (const section of SECTIONS) {
      for (const item of section.fields) {
        // Token、用户词典不是设置项
        if (item.kind !== "token" && item.kind !== "dictionary") expect(valueOf(DEFAULT_SETTINGS, item.key), item.key).not.toBeUndefined();
      }
    }
  });
});
