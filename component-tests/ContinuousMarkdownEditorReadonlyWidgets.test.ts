import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));
  await nextTick();
}

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: false,
      settings: defaultEditorSettings,
    },
  });
}

describe("ContinuousMarkdownEditor readonly widget lifecycle", () => {
  it("rebuilds inline widgets and task controls across false true false", async () => {
    const source = [
      "Cursor, entity &amp;, abbr HTML, inline <span>HTML</span>.",
      "- [ ] task",
      "*[HTML]: Hyper Text Markup Language",
    ].join("\n");
    const wrapper = mountEditor(source);

    try {
      await settleUi();
      const selectors = [
        ".cm-rendered-entity",
        "abbr.cm-rendered-abbreviation",
        ".cm-rendered-inline-html",
      ];
      for (const selector of selectors) {
        expect(wrapper.get(selector).attributes("role")).toBe("button");
      }
      const editableEntity = wrapper.get(".cm-rendered-entity").element;
      expect(wrapper.get<HTMLInputElement>(".cm-rendered-task-marker input").element.disabled)
        .toBe(false);

      await wrapper.setProps({ readonly: true });
      await settleUi();

      expect(wrapper.get(".cm-rendered-entity").element).not.toBe(editableEntity);
      for (const selector of selectors) {
        expect(wrapper.get(selector).attributes("role")).toBeUndefined();
      }
      const readonlyCheckbox = wrapper.get<HTMLInputElement>(".cm-rendered-task-marker input");
      expect(readonlyCheckbox.element.disabled).toBe(true);
      readonlyCheckbox.element.checked = true;
      readonlyCheckbox.element.dispatchEvent(new Event("change", { bubbles: true }));
      await settleUi();
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();

      await wrapper.setProps({ readonly: false });
      await settleUi();

      for (const selector of selectors) {
        expect(wrapper.get(selector).attributes("role")).toBe("button");
      }
      const editableCheckbox = wrapper.get<HTMLInputElement>(".cm-rendered-task-marker input");
      expect(editableCheckbox.element.disabled).toBe(false);
      editableCheckbox.element.checked = true;
      editableCheckbox.element.dispatchEvent(new Event("change", { bubbles: true }));
      await settleUi();
      expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toContain("- [x] task");
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    {
      source: "\n[docs]: https://example.com/docs",
      root: ".cm-reference-definition",
      control: ".cm-reference-definition-url",
      editableRootRole: "group",
      readonlyRootRole: "region",
      selectedText: "https://example.com/docs",
    },
    {
      source: "\n[^note]: footnote body",
      root: ".cm-footnote-definition-widget",
      control: ".cm-footnote-definition-content",
      editableRootRole: "group",
      readonlyRootRole: "region",
      selectedText: "footnote body",
    },
    {
      source: "\n> [!NOTE]\n> alert body",
      root: ".cm-rendered-alert-title",
      control: ".cm-rendered-alert-title",
      editableRootRole: "button",
      readonlyRootRole: undefined,
      selectedText: "NOTE",
    },
  ])("rebuilds $root interaction and restores source selection", async (fixture) => {
    const wrapper = mountEditor(fixture.source);

    try {
      await settleUi();
      const editor = wrapper.vm as unknown as {
        getViewState: () => { anchor: number; head: number };
      };
      const editableRoot = wrapper.get(fixture.root).element;
      expect(wrapper.get(fixture.root).attributes("role")).toBe(fixture.editableRootRole);
      expect(wrapper.get(fixture.control).attributes("role")).toBe("button");

      await wrapper.setProps({ readonly: true });
      await settleUi();

      expect(wrapper.get(fixture.root).element).not.toBe(editableRoot);
      expect(wrapper.get(fixture.root).attributes("role")).toBe(fixture.readonlyRootRole);
      expect(wrapper.get(fixture.control).attributes("role")).toBeUndefined();
      const readonlySelection = editor.getViewState();
      await wrapper.get(fixture.control).trigger("click");
      await settleUi();
      expect(editor.getViewState()).toEqual(readonlySelection);
      expect(wrapper.find(fixture.root).exists()).toBe(true);

      await wrapper.setProps({ readonly: false });
      await settleUi();

      expect(wrapper.get(fixture.root).attributes("role")).toBe(fixture.editableRootRole);
      expect(wrapper.get(fixture.control).attributes("role")).toBe("button");
      await wrapper.get(fixture.control).trigger("click");
      await settleUi();
      const selection = editor.getViewState();
      const from = Math.min(selection.anchor, selection.head);
      const to = Math.max(selection.anchor, selection.head);
      expect(fixture.source.slice(from, to)).toBe(fixture.selectedText);
    } finally {
      wrapper.unmount();
    }
  });

  it("stores CodeMirror document references for image double click caching", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/ContinuousMarkdownEditor.vue"),
      "utf8",
    );
    expect(source).toContain('document: EditorState["doc"];');
    expect(source.match(/recentImageClicks\.set\(view, \{\s*document: view\.state\.doc,/g))
      .toHaveLength(2);
    expect(source).toContain("recentImageClick.document === view.state.doc");
    expect(source).not.toContain("recentImageClick.document === view.state.doc.toString()");
  });
});