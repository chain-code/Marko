import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import MarkoMarkdownBody from "@/components/MarkoMarkdownBody.vue";

async function settleBody() {
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("MarkoMarkdownBody 实时目录", () => {
  it("标题新增、重命名和重复锚点变化后同步更新屏内目录", async () => {
    const wrapper = mount(MarkoMarkdownBody, {
      attachTo: document.body,
      props: {
        modelValue: "[TOC]\n\n# First",
        readOnly: true,
      },
    });

    try {
      await settleBody();
      await vi.waitFor(
        () => expect(wrapper.findAll(".toc-inline a")).toHaveLength(1),
        { timeout: 5000 },
      );
      expect(wrapper.get(".toc-inline a").text()).toBe("First");
      expect(wrapper.get(".toc-inline a").attributes("href")).toBe("#first");

      await wrapper.setProps({
        modelValue: "[TOC]\n\n# Renamed\n\n## Renamed",
      });
      await settleBody();
      await vi.waitFor(() => {
        const links = wrapper.findAll(".toc-inline a");
        expect(links.map((link) => link.text())).toEqual(["Renamed", "Renamed"]);
        expect(links.map((link) => link.attributes("href"))).toEqual(["#renamed", "#renamed-1"]);
      });

      await wrapper.setProps({ modelValue: "{: toc depth=3 }\n\n## Final" });
      await settleBody();
      await vi.waitFor(() => {
        const links = wrapper.findAll(".toc-inline a");
        expect(links).toHaveLength(1);
        expect(links[0]?.text()).toBe("Final");
        expect(links[0]?.attributes("href")).toBe("#final");
      });
    } finally {
      wrapper.unmount();
    }
  });
});
