import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConfirmActionDialog from "@/components/ConfirmActionDialog.vue";

describe("ConfirmActionDialog", () => {
  it("uses alert dialog semantics and initially focuses the safe action", async () => {
    const wrapper = mount(ConfirmActionDialog, {
      attachTo: document.body,
      props: {
        title: "将文件移到回收站",
        message: "可以稍后从回收站恢复。",
        confirmLabel: "移到回收站",
      },
    });
    await wrapper.vm.$nextTick();

    const dialog = wrapper.get("[role='alertdialog']");
    const buttons = wrapper.findAll<HTMLButtonElement>("button");
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(buttons[0].element);
    expect(buttons[1].text()).toBe("移到回收站");

    wrapper.unmount();
  });

  it("emits confirm, cancel, and Escape cancellation", async () => {
    const wrapper = mount(ConfirmActionDialog, {
      props: {
        title: "删除",
        message: "确认删除",
      },
    });
    const buttons = wrapper.findAll("button");
    await buttons[1].trigger("click");
    await buttons[0].trigger("click");
    await wrapper.get(".dialog-mask").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(2);
  });
});
