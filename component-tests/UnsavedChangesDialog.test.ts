import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog.vue";

describe("UnsavedChangesDialog", () => {
  it("默认聚焦保存按钮并提供三种 Typora 式选择", async () => {
    const wrapper = mount(UnsavedChangesDialog, {
      attachTo: document.body,
      props: { fileName: "note.md", busy: false },
    });
    await nextTick();

    const buttons = wrapper.findAll("button");
    expect(buttons.map((button) => button.text().trim())).toEqual(["取消", "不保存", "保存"]);
    expect(document.activeElement).toBe(buttons[2].element);

    await buttons[1].trigger("click");
    expect(wrapper.emitted("discard")).toHaveLength(1);
    wrapper.unmount();
  });

  it("按 Escape 取消，保存期间禁用所有动作", async () => {
    const wrapper = mount(UnsavedChangesDialog, {
      props: { fileName: "note.md", busy: true },
    });

    expect(wrapper.findAll("button").every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    await wrapper.find(".unsaved-mask").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
