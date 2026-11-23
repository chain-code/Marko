import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SettingsPanel from "@/components/SettingsPanel.vue";
import type { EditorSettings } from "@/types";
import { defaultEditorSettings } from "@/utils/editorSettings";

function findSetting(wrapper: VueWrapper, title: string) {
  const row = wrapper.findAll("label").find((item) => item.find("strong").text() === title);
  if (!row) throw new Error(`找不到设置项：${title}`);
  return row;
}

describe("SettingsPanel default code language", () => {
  it("selects empty, last-used or fixed language and its application channel", async () => {
    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      props: {
        modelValue: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await wrapper.findAll(".settings-nav button").find((item) => item.text() === "Markdown")?.trigger("click");

    await findSetting(wrapper, "默认代码语言").get("select").setValue("last");
    let settings = wrapper.emitted<EditorSettings[]>("update:modelValue")?.at(-1)?.[0];
    expect(settings?.defaultCodeLanguage).toBe("__LAST");

    if (!settings) throw new Error("设置更新事件缺失");
    await wrapper.setProps({ modelValue: settings });
    await findSetting(wrapper, "应用默认语言时机").get("select").setValue("both");
    settings = wrapper.emitted<EditorSettings[]>("update:modelValue")?.at(-1)?.[0];
    expect(settings?.defaultCodeLanguageApplyTo).toBe("both");

    await findSetting(wrapper, "默认代码语言").get("select").setValue("fixed");
    await findSetting(wrapper, "固定语言").get("input").setValue("rust");
    settings = wrapper.emitted<EditorSettings[]>("update:modelValue")?.at(-1)?.[0];
    expect(settings?.defaultCodeLanguage).toBe("rust");
    wrapper.unmount();
  });
});
