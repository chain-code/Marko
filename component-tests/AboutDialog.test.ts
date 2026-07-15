import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AboutDialog from "@/components/AboutDialog.vue";

describe("AboutDialog", () => {
  it("shows application information and focuses the close action", async () => {
    const wrapper = mount(AboutDialog, { attachTo: document.body });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="dialog"]').attributes("aria-modal")).toBe("true");
    expect(wrapper.text()).toContain("Marko");
    expect(wrapper.text()).toContain("版本 0.1.0");
    expect(document.activeElement).toBe(wrapper.get("button").element);

    wrapper.unmount();
  });

  it("closes from the button and Escape", async () => {
    const wrapper = mount(AboutDialog);
    await wrapper.get("button").trigger("click");
    await wrapper.get(".about-mask").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("close")).toHaveLength(2);
  });
});
