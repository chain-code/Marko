import { mount, shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BlockEditor from "@/components/BlockEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

const settings: EditorSettings = {
  ...defaultEditorSettings,
  autoNumberingForMath: "all",
  extensions: { ...defaultEditorSettings.extensions },
};

describe("MarkdownPreview MathJax document positions", () => {
  it("renders a duplicate math block with its absolute document number", () => {
    const block = "$$\nx = 1\n$$";
    const documentSource = `${block}\n\n${block}`;
    const wrapper = mount(MarkdownPreview, {
      props: {
        source: block,
        documentSource,
        sourceOffset: documentSource.lastIndexOf(block),
        outline: [],
        settings,
      },
    });

    expect(wrapper.html()).toContain('id="mjx-eqn:2"');
    expect(wrapper.html()).not.toContain('id="mjx-eqn:1"');
    wrapper.unmount();
  });

  it("passes every block start through BlockEditor preview components", () => {
    const block = "$$\nx = 1\n$$";
    const documentSource = `${block}\n\n${block}`;
    const wrapper = shallowMount(BlockEditor, {
      props: {
        modelValue: documentSource,
        outline: [],
        settings,
      },
    });

    expect(wrapper.findAllComponents(MarkdownPreview).map((preview) => preview.props("sourceOffset")))
      .toEqual([0, documentSource.lastIndexOf(block)]);
    wrapper.unmount();
  });

  it("passes every rich block start through BlockEditor rich components", () => {
    const block = "Same paragraph";
    const documentSource = `${block}\n\n${block}`;
    const wrapper = shallowMount(BlockEditor, {
      props: {
        modelValue: documentSource,
        outline: [],
        settings,
      },
    });

    expect(wrapper.findAllComponents(RichMarkdownBlock).map((editor) => editor.props("sourceOffset")))
      .toEqual([0, documentSource.lastIndexOf(block)]);
    wrapper.unmount();
  });
});
