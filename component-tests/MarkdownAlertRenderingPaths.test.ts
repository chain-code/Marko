import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const alertKinds = [
  ["NOTE", "note", "Note"],
  ["TIP", "tip", "Tip"],
  ["IMPORTANT", "important", "Important"],
  ["WARNING", "warning", "Warning"],
  ["CAUTION", "caution", "Caution"],
] as const;
type AlertKind = (typeof alertKinds)[number];

function createAlertSource(kinds: readonly AlertKind[]) {
  return kinds.map(([marker, _kind, label]) => {
    const lines = ["> [!" + marker + "]", "> " + label + " body"];
    if (marker === "NOTE") lines.push("> - list item", "> > nested quote");
    return lines.join("\n");
  }).join("\n\n");
}

const source = createAlertSource(alertKinds);

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function expectAlerts(
  wrapper: VueWrapper,
  path: string,
  expectedKinds: readonly AlertKind[] = alertKinds,
) {
  const alerts = wrapper.findAll(".md-alert");
  expect(alerts, path).toHaveLength(expectedKinds.length);

  expectedKinds.forEach(([_marker, kind, label], index) => {
    const alert = alerts[index]!;
    expect(alert.classes(), path).toContain("md-alert-" + kind);

    const title = alert.get(".md-alert-title");
    expect(title.classes(), path).toContain("md-alert-text-" + kind);
    expect(title.get(".md-alert-text-container").text(), path).toBe(label);
    expect(title.element.tagName, path).toBe("P");
    expect(title.element.nextElementSibling?.tagName, path).toBe("P");
    expect(title.element.nextElementSibling?.textContent, path).toContain(label + " body");

    const icon = title.get("svg.md-alert-icon");
    expect(icon.attributes("aria-hidden"), path).toBe("true");
    expect(icon.attributes("focusable"), path).toBe("false");
    expect(icon.get("path").attributes("d"), path).not.toBe("");
  });

  if (expectedKinds.some(([_marker, kind]) => kind === "note")) {
    expect(wrapper.find(".md-alert-note ul").exists(), path).toBe(true);
    expect(wrapper.find(".md-alert-note blockquote").exists(), path).toBe(true);
  }
}

describe("Markdown Alert rendering paths", () => {
  it("renders five Typora-style alerts in Preview, Rich and Continuous", async () => {
    const renderedWrappers = [
      mount(MarkdownPreview, {
        props: {
          source,
          outline: [],
          settings: defaultEditorSettings,
        },
      }),
      mount(RichMarkdownBlock, {
        props: {
          source,
          documentSource: source,
          outline: [],
          settings: defaultEditorSettings,
        },
      }),
    ];
    await settleUi();

    renderedWrappers.forEach((wrapper, index) => {
      expectAlerts(wrapper, ["Preview", "Rich"][index]!);
      wrapper.unmount();
    });

    for (const alertKind of alertKinds) {
      const [_marker, kind, label] = alertKind;
      const alertSource = createAlertSource([alertKind]);
      const wrapper = mount(ContinuousMarkdownEditor, {
        attachTo: document.body,
        props: {
          modelValue: alertSource,
          outline: [],
          readonly: true,
          settings: defaultEditorSettings,
        },
      });
      await settleUi();
      const editor = wrapper.vm as unknown as {
        refreshLayout: () => void;
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      await editor.selectRange(alertSource.length, alertSource.length, false);
      editor.refreshLayout();
      await settleUi();

      expect(wrapper.find(".cm-special-preview-callout").exists()).toBe(false);
      expect(wrapper.find(".md-alert").exists()).toBe(false);

      const title = wrapper.get(`.cm-alert-${kind}.cm-alert-title`);
      expect(title.classes()).toContain("cm-alert-first");
      expect(title.get(".cm-rendered-alert-label").text()).toBe(label);
      const icon = title.get("svg.cm-rendered-alert-icon");
      expect(icon.attributes("aria-hidden")).toBe("true");
      expect(icon.get("path").attributes("d")).not.toBe("");
      wrapper.unmount();
    }
  });
});


