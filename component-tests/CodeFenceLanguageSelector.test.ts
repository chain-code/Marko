import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import CodeFenceLanguageSelector from "@/components/CodeFenceLanguageSelector.vue";

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

describe("CodeFenceLanguageSelector", () => {
  it("keeps the Typora-sized control stable and contained on narrow editors", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/CodeFenceLanguageSelector.vue"),
      "utf8",
    );
    const controlRule = source.match(
      /\.code-fence-language-trigger\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";

    expect(controlRule).toMatch(/box-sizing:\s*border-box;/);
    expect(controlRule).toMatch(/width:\s*180px;/);
    expect(controlRule).toMatch(/min-width:\s*0;/);
    expect(controlRule).toMatch(/max-width:\s*100%;/);
    expect(controlRule).toMatch(/height:\s*26px;/);
    expect(source).not.toMatch(/transition\s*:/);
    expect(source).not.toContain("code-fence-language-static");
  });

  it("searches known languages and selects the active result with the keyboard", async () => {
    const wrapper = mount(CodeFenceLanguageSelector, {
      attachTo: document.body,
      props: { value: "javascript", sourceOffset: 20 },
    });

    expect(wrapper.get(".code-fence-language-trigger").text()).toContain("javascript");
    await wrapper.get(".code-fence-language-trigger").trigger("click");
    await settleUi();

    const input = wrapper.get<HTMLInputElement>("input[aria-label='搜索代码语言']");
    expect(document.activeElement).toBe(input.element);
    await input.setValue("typ");
    await settleUi();
    expect(wrapper.get("[data-language='typescript']").text()).toContain("TypeScript");

    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted<string[]>("select")?.at(-1)?.[0]).toBe("typescript");
    expect(wrapper.find(".code-fence-language-popover").exists()).toBe(false);
    wrapper.unmount();
  });

  it("supports unknown info strings and arrow-key candidate navigation", async () => {
    const wrapper = mount(CodeFenceLanguageSelector, {
      attachTo: document.body,
      props: { value: "", sourceOffset: 40 },
    });
    await wrapper.get(".code-fence-language-trigger").trigger("click");
    await settleUi();

    const input = wrapper.get<HTMLInputElement>("input[aria-label='搜索代码语言']");
    await input.setValue("custom-lang");
    await settleUi();
    expect(wrapper.get("[data-language='custom-lang']").text()).toContain("使用“custom-lang”");
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "ArrowUp" });
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted<string[]>("select")?.at(-1)?.[0]).toBe("custom-lang");
    wrapper.unmount();
  });

  it("closes on Escape and restores focus to the language trigger", async () => {
    const wrapper = mount(CodeFenceLanguageSelector, {
      attachTo: document.body,
      props: { value: "python", sourceOffset: 60 },
    });
    const trigger = wrapper.get<HTMLButtonElement>(".code-fence-language-trigger");
    await trigger.trigger("click");
    await settleUi();

    await wrapper.get("input[aria-label='搜索代码语言']").trigger("keydown", { key: "Escape" });
    await settleUi();
    expect(wrapper.find(".code-fence-language-popover").exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("emits an empty info string from the clear command", async () => {
    const wrapper = mount(CodeFenceLanguageSelector, {
      attachTo: document.body,
      props: { value: "rust", sourceOffset: 80 },
    });
    await wrapper.get(".code-fence-language-trigger").trigger("click");
    await settleUi();
    await wrapper.get(".code-fence-language-clear").trigger("click");

    expect(wrapper.emitted<string[]>("select")?.at(-1)?.[0]).toBe("");
    wrapper.unmount();
  });
});
