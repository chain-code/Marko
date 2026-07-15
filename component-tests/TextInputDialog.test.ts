import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TextInputDialog from "@/components/TextInputDialog.vue";

describe("TextInputDialog", () => {
  it("focuses and selects the initial value", async () => {
    const wrapper = mount(TextInputDialog, {
      attachTo: document.body,
      props: {
        title: "重命名文件",
        message: "输入新的文件名",
        initialValue: "note.md",
      },
    });
    await wrapper.vm.$nextTick();

    const input = wrapper.get<HTMLInputElement>("input");
    expect(document.activeElement).toBe(input.element);
    expect(input.element.selectionStart).toBe(0);
    expect(input.element.selectionEnd).toBe("note.md".length);

    wrapper.unmount();
  });

  it("trims submitted text and supports cancellation", async () => {
    const wrapper = mount(TextInputDialog, {
      props: {
        title: "新建文件夹",
        message: "输入文件夹名称",
      },
    });
    await wrapper.get("input").setValue("  drafts  ");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("button[type='button']").trigger("click");

    expect(wrapper.emitted("confirm")).toEqual([["drafts"]]);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
