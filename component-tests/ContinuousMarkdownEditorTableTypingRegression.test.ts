import { mount } from "@vue/test-utils";
import { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function getCellEditor(element: HTMLElement): EditorView {
  const editor = EditorView.findFromDOM(element);
  if (!editor) throw new Error("未找到表格单元格编辑器");
  return editor;
}

describe("ContinuousMarkdownEditor table typing regression", () => {
  it("keeps the active table cell editable across consecutive v-model updates", async () => {
    const initialValue = [
      "| A | B |",
      "| --- | --- |",
      "| one | two |",
      "",
      "after",
    ].join("\n");
    const Harness = defineComponent({
      setup() {
        const value = ref(initialValue);
        return () => h(ContinuousMarkdownEditor, {
          modelValue: value.value,
          outline: [],
          settings: defaultEditorSettings,
          "onUpdate:modelValue": (nextValue: string) => {
            value.value = nextValue;
          },
        });
      },
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    await settleUi();

    await wrapper.get("tbody td").trigger("mousedown", {
      button: 0,
      buttons: 1,
      detail: 1,
    });
    await settleUi();

    for (const character of "XYZ") {
      const content = wrapper.get<HTMLElement>(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      );
      const editor = getCellEditor(content.element);
      const position = editor.state.doc.length;
      editor.dispatch({
        changes: { from: position, insert: character },
        selection: { anchor: position + character.length },
        annotations: Transaction.userEvent.of("input.type"),
      });
      await settleUi();

      expect(wrapper.findAll(".table-cell-inline-editor")).toHaveLength(1);
      expect(document.activeElement).toBe(content.element);
    }

    const activeContent = wrapper.get<HTMLElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(getCellEditor(activeContent.element).state.doc.toString()).toBe("oneXYZ");
    expect(wrapper.get("tbody tr").text()).toContain("oneXYZ");
    wrapper.unmount();
  });
});
