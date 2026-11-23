import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0h100v50H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

interface WidgetSpacingFixture {
  name: string;
  source: string;
  selector: string;
  spacing: number;
}

const relativeBlockSpacing = defaultEditorSettings.fontSize * 0.8;
const widgetSpacingFixtures: WidgetSpacingFixture[] = [
  {
    name: "image",
    source: `![pixel](${pixel})`,
    selector: ".cm-special-preview-image",
    spacing: relativeBlockSpacing,
  },
  {
    name: "table",
    source: ["| A |", "| --- |", "| one |"].join("\n"),
    selector: ".cm-visual-table-widget",
    spacing: defaultEditorSettings.fontSize * 1.2,
  },
  {
    name: "definition",
    source: ["Term", ": Definition"].join("\n"),
    selector: ".cm-special-preview-definition",
    spacing: relativeBlockSpacing,
  },
  {
    name: "html",
    source: "<p>HTML paragraph</p>",
    selector: ".cm-special-preview-html",
    spacing: relativeBlockSpacing,
  },
  {
    name: "code",
    source: ["~~~text", "code", "~~~"].join("\n"),
    selector: ".cm-special-preview-code",
    spacing: 15,
  },
  {
    name: "diagram",
    source: ["~~~mermaid", "flowchart LR", "A --> B", "~~~"].join("\n"),
    selector: ".cm-special-preview-diagram",
    spacing: 15,
  },
  {
    name: "math",
    source: ["$$", "x + y", "$$"].join("\n"),
    selector: ".cm-special-preview-math",
    spacing: 16,
  },
  {
    name: "toc",
    source: "[TOC]",
    selector: ".cm-special-preview-toc",
    spacing: 20,
  },
];

beforeEach(() => {
  mockCompactLayout();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor Typora body recheck", () => {
  it("keeps only the larger spacing edge between adjacent table, code and math widgets", async () => {
    const source = [
      "| A |",
      "| --- |",
      "| one |",
      "",
      "~~~text",
      "code",
      "~~~",
      "",
      "$$",
      "x + y",
      "$$",
      "",
      "| B |",
      "| --- |",
      "| two |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const tables = wrapper.findAll(".cm-visual-table-widget");
    expect(tables).toHaveLength(2);
    expect(tables[0]!.classes()).not.toContain("cm-preview-collapse-after");
    expect(tables[0]!.classes()).not.toContain("cm-preview-collapse-before");

    const code = wrapper.get(".cm-special-preview-code");
    expect(code.classes()).toContain("cm-preview-collapse-after");
    expect(code.classes()).toContain("cm-preview-collapse-before");
    expect(code.find(".code-fence-language-selector").exists()).toBe(false);

    const math = wrapper.get(".cm-special-preview-math");
    expect(math.classes()).not.toContain("cm-preview-collapse-before");
    expect(math.classes()).toContain("cm-preview-collapse-after");

    expect(tables[1]!.classes()).not.toContain("cm-preview-collapse-before");
    expect(tables[1]!.classes()).not.toContain("cm-preview-collapse-after");
    wrapper.unmount();
  });

  it("uses computed spacing sizes when the editor font is larger", async () => {
    const table = ["| A |", "| --- |", "| one |"];
    const code = ["~~~text", "code", "~~~"];
    const math = ["$$", "x + y", "$$"];
    const cases = [
      {
        source: [...table, "", ...code].join("\n"),
        first: ".cm-visual-table-widget",
        second: ".cm-special-preview-code",
        firstAfter: false,
        secondBefore: true,
      },
      {
        source: [...code, "", ...table].join("\n"),
        first: ".cm-special-preview-code",
        second: ".cm-visual-table-widget",
        firstAfter: true,
        secondBefore: false,
      },
      {
        source: [...table, "", ...math].join("\n"),
        first: ".cm-visual-table-widget",
        second: ".cm-special-preview-math",
        firstAfter: false,
        secondBefore: true,
      },
      {
        source: [...math, "", ...table].join("\n"),
        first: ".cm-special-preview-math",
        second: ".cm-visual-table-widget",
        firstAfter: true,
        secondBefore: false,
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source, true, 22);
      await settleUi();
      expect(
        wrapper.get(current.first).classes().includes("cm-preview-collapse-after"),
        current.source,
      ).toBe(current.firstAfter);
      expect(
        wrapper.get(current.second).classes().includes("cm-preview-collapse-before"),
        current.source,
      ).toBe(current.secondBefore);
      wrapper.unmount();
    }
  });

  it("\u4fdd\u7559\u524d\u8868\u95f4\u8ddd\u5e76\u4e3a\u540e\u8868\u5de5\u5177\u680f\u63d0\u4f9b\u4e00\u4e2a\u50cf\u7d20\u7684\u5b89\u5168\u8fb9", async () => {
    const source = [
      "| A |",
      "| --- |",
      "| one |",
      "",
      "| B |",
      "| --- |",
      "| two |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const tables = wrapper.findAll(".cm-visual-table-widget");
    expect(tables).toHaveLength(2);
    expect(tables[0]!.classes()).not.toContain("cm-preview-collapse-after");
    expect(tables[1]!.classes()).toContain("cm-preview-collapse-before");
    wrapper.unmount();
  });

  it("applies runtime spacing classes around every preview widget kind", async () => {
    for (const fixture of widgetSpacingFixtures) {
      const wrapper = mountEditor(["Before", "", fixture.source, "", "After"].join("\n"));
      await settleUi();

      const widget = wrapper.get<HTMLElement>(fixture.selector);
      const beforeGap = findAdjacentBlockGap(wrapper.element, widget.element, "before");
      const keepsSourceGapBefore = relativeBlockSpacing >= fixture.spacing;
      if (keepsSourceGapBefore) {
        expect(beforeGap, `${fixture.name} retained before gap`).toBeDefined();
        expect(
          beforeGap!.classList.contains("cm-spacing-collapsed-gap"),
          `${fixture.name} retained before gap`,
        ).toBe(false);
      } else {
        expect(
          beforeGap === undefined
            || beforeGap.classList.contains("cm-spacing-collapsed-gap"),
          `${fixture.name} collapsed before gap`,
        ).toBe(true);
      }
      expect(
        widget.classes().includes("cm-preview-collapse-before"),
        `${fixture.name} before edge`,
      ).toBe(keepsSourceGapBefore);
      expect(
        widget.classes().includes("cm-preview-collapse-after"),
        `${fixture.name} after edge`,
      ).toBe(false);
      wrapper.unmount();
    }
  });

  it("collapses the smaller edge between all adjacent preview widget kinds", async () => {
    const source = widgetSpacingFixtures.map((fixture) => fixture.source).join("\n\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const widgets = widgetSpacingFixtures.map((fixture) => (
      wrapper.get<HTMLElement>(fixture.selector)
    ));
    const expectedBefore = widgetSpacingFixtures.map(() => false);
    const expectedAfter = widgetSpacingFixtures.map(() => false);
    for (let index = 0; index < widgetSpacingFixtures.length - 1; index += 1) {
      if (widgetSpacingFixtures[index]!.spacing >= widgetSpacingFixtures[index + 1]!.spacing) {
        expectedBefore[index + 1] = true;
      } else {
        expectedAfter[index] = true;
      }
    }

    widgets.forEach((widget, index) => {
      const name = widgetSpacingFixtures[index]!.name;
      expect(
        widget.classes().includes("cm-preview-collapse-before"),
        `${name} adjacent before edge`,
      ).toBe(expectedBefore[index]);
      expect(
        widget.classes().includes("cm-preview-collapse-after"),
        `${name} adjacent after edge`,
      ).toBe(expectedAfter[index]);
    });
    const contentChildren = Array.from(
      wrapper.get(".cm-content").element.children,
    ).filter((element) => (
      element.matches(".cm-special-preview, .cm-visual-table-widget")
    ));
    expect(contentChildren).toHaveLength(widgetSpacingFixtures.length);
    wrapper.unmount();
  });

  it("keeps heading spacing against smaller and larger widgets in both directions", async () => {
    const cases = [
      {
        source: ["# Heading", "", widgetSpacingFixtures[1]!.source].join("\n"),
        widget: widgetSpacingFixtures[1]!,
        headingClass: "cm-spacing-collapse-after",
        widgetClass: null,
      },
      {
        source: [widgetSpacingFixtures[1]!.source, "", "# Heading"].join("\n"),
        widget: widgetSpacingFixtures[1]!,
        headingClass: "cm-spacing-collapse-before",
        widgetClass: null,
      },
      {
        source: ["# Heading", "", widgetSpacingFixtures[7]!.source].join("\n"),
        widget: widgetSpacingFixtures[7]!,
        headingClass: "cm-spacing-collapse-after",
        widgetClass: null,
      },
      {
        source: [widgetSpacingFixtures[7]!.source, "", "# Heading"].join("\n"),
        widget: widgetSpacingFixtures[7]!,
        headingClass: "cm-spacing-collapse-before",
        widgetClass: null,
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      const heading = wrapper.get(".cm-heading-1");
      const widget = wrapper.get(current.widget.selector);
      const gap = wrapper.find(".cm-line.cm-heading-gap");
      if (gap.exists()) {
        expect(gap.classes(), current.source).toContain("cm-spacing-collapsed-gap");
      } else {
        expect(
          heading.element.previousElementSibling === widget.element
            || heading.element.nextElementSibling === widget.element,
          current.source,
        ).toBe(true);
      }
      for (const className of ["cm-spacing-collapse-before", "cm-spacing-collapse-after"]) {
        expect(heading.classes().includes(className), `${current.source} ${className}`)
          .toBe(current.headingClass === className);
      }
      for (const className of ["cm-preview-collapse-before", "cm-preview-collapse-after"]) {
        expect(widget.classes().includes(className), `${current.source} ${className}`)
          .toBe(current.widgetClass === className);
      }
      wrapper.unmount();
    }
  });

  it("keeps one spacing owner around list headings and block widgets", async () => {
    const table = widgetSpacingFixtures[1]!;
    const code = widgetSpacingFixtures[4]!;
    const cases = [
      {
        source: ["- # Heading", "", table.source].join("\n"),
        widget: table,
        listClass: "cm-bullet-list",
        quoted: false,
        widgetCollapse: null,
        gapCollapsed: true,
      },
      {
        source: [table.source, "", "1. # Heading"].join("\n"),
        widget: table,
        listClass: "cm-ordered-list",
        quoted: false,
        widgetCollapse: null,
        gapCollapsed: null,
      },
      {
        source: ["- # Heading", "", code.source].join("\n"),
        widget: code,
        listClass: "cm-bullet-list",
        quoted: false,
        widgetCollapse: "cm-preview-collapse-before",
        gapCollapsed: true,
      },
      {
        source: [code.source, "", "1. # Heading"].join("\n"),
        widget: code,
        listClass: "cm-ordered-list",
        quoted: false,
        widgetCollapse: "cm-preview-collapse-after",
        gapCollapsed: null,
      },
      {
        source: ["> - # Heading", "", table.source].join("\n"),
        widget: table,
        listClass: "cm-bullet-list",
        quoted: true,
        widgetCollapse: null,
        gapCollapsed: true,
      },
      {
        source: [table.source, "", "> - # Heading"].join("\n"),
        widget: table,
        listClass: "cm-bullet-list",
        quoted: true,
        widgetCollapse: null,
        gapCollapsed: null,
      },
      {
        source: ["> - # Heading", "", code.source].join("\n"),
        widget: code,
        listClass: "cm-bullet-list",
        quoted: true,
        widgetCollapse: null,
        gapCollapsed: true,
      },
      {
        source: [code.source, "", "> - # Heading"].join("\n"),
        widget: code,
        listClass: "cm-bullet-list",
        quoted: true,
        widgetCollapse: null,
        gapCollapsed: null,
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      const heading = wrapper.get<HTMLElement>(".cm-heading-1");
      const widget = wrapper.get<HTMLElement>(current.widget.selector);
      expect(heading.classes(), current.source).toContain(current.listClass);
      expect(heading.classes().includes("cm-blockquote"), current.source).toBe(current.quoted);
      for (const className of ["cm-preview-collapse-before", "cm-preview-collapse-after"]) {
        expect(widget.classes().includes(className), `${current.source} ${className}`)
          .toBe(current.widgetCollapse === className);
      }
      const root = wrapper.element as HTMLElement;
      const gap = Array.from(
        root.querySelectorAll<HTMLElement>(".cm-line.cm-block-gap"),
      ).find((candidate) => (
        (candidate.previousElementSibling === heading.element
          && candidate.nextElementSibling === widget.element)
        || (candidate.previousElementSibling === widget.element
          && candidate.nextElementSibling === heading.element)
      ));
      if (current.gapCollapsed === null) {
        expect(gap, current.source).toBeUndefined();
        expect(
          heading.element.previousElementSibling === widget.element
            || heading.element.nextElementSibling === widget.element,
          current.source,
        ).toBe(true);
      } else {
        expect(gap, current.source).toBeDefined();
        expect(gap!.classList.contains("cm-spacing-collapsed-gap"), current.source)
          .toBe(current.gapCollapsed);
      }
      wrapper.unmount();
    }
  });

  it("keeps one normal gap between list headings and paragraphs", async () => {
    for (const source of [
      ["- # Heading", "", "Paragraph"].join("\n"),
      ["Paragraph", "", "1. # Heading"].join("\n"),
      ["> - # Heading", "", "Paragraph"].join("\n"),
      ["Paragraph", "", "> - # Heading"].join("\n"),
    ]) {
      const wrapper = mountEditor(source);
      await settleUi();
      const gaps = wrapper.findAll(".cm-line.cm-block-gap");
      expect(gaps, source).toHaveLength(1);
      expect(gaps[0]!.classes(), source).not.toContain("cm-spacing-collapsed-gap");
      expect(gaps[0]!.classes(), source).not.toContain("cm-block-gap-extra");
      wrapper.unmount();
    }
  });

  it("collapses heading gaps on both sides of horizontal rules", async () => {
    const cases = [
      {
        source: ["# Heading", "", "***"].join("\n"),
        target: ".cm-horizontal-rule",
      },
      {
        source: ["***", "", "# Heading"].join("\n"),
        target: ".cm-heading-1",
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      expect(wrapper.get(".cm-line.cm-heading-gap").classes(), current.source)
        .toContain("cm-spacing-collapsed-gap");
      expect(wrapper.get(current.target).classes(), current.source)
        .toContain("cm-spacing-collapse-before");
      wrapper.unmount();
    }
  });

  it("keeps tagged and untagged code language controls outside document flow", async () => {
    const source = [
      "~~~text",
      "tagged",
      "~~~",
      "",
      "~~~",
      "untagged",
      "~~~",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const codeBlocks = wrapper.findAll(".cm-special-preview-code");
    expect(codeBlocks).toHaveLength(2);
    for (const block of codeBlocks) {
      expect(block.findAll(".cm-code-language-mount")).toHaveLength(0);
      expect(block.findAll(".code-fence-language-selector")).toHaveLength(0);
    }
    expect(codeBlocks[0]!.classes()).not.toContain("cm-preview-collapse-after");
    expect(codeBlocks[1]!.classes()).toContain("cm-preview-collapse-before");
    expect(codeBlocks[0]!.element.nextElementSibling).toBe(codeBlocks[1]!.element);
    wrapper.unmount();
  });

  it("distinguishes HTML blocks that own Typora edge spacing from zero-margin roots", async () => {
    const cases = [
      {
        html: "<div>plain</div>",
        before: false,
        after: false,
      },
      {
        html: "<div><p>paragraph</p></div>",
        before: true,
        after: true,
      },
      {
        html: `<div><img src="${pixel}" alt="pixel"></div>`,
        before: false,
        after: false,
      },
      {
        html: "<video controls></video>",
        before: false,
        after: false,
        directTag: "VIDEO",
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(["Before", "", current.html, "", "After"].join("\n"));
      await settleUi();

      const html = wrapper.get(".cm-special-preview-html");
      expect(html.classes().includes("cm-html-spacing-before"), current.html)
        .toBe(current.before);
      expect(html.classes().includes("cm-html-spacing-after"), current.html)
        .toBe(current.after);
      if (current.directTag) {
        expect(html.element.firstElementChild?.tagName, current.html)
          .toBe(current.directTag);
      }
      const beforeGap = findAdjacentBlockGap(wrapper.element, html.element, "before");
      const afterGap = findAdjacentBlockGap(wrapper.element, html.element, "after");
      expect(beforeGap, `${current.html} before gap`).toBeDefined();
      expect(beforeGap!.classList.contains("cm-spacing-collapsed-gap"), current.html)
        .toBe(false);
      if (!current.after) {
        expect(afterGap, `${current.html} retained after gap`).toBeDefined();
        expect(afterGap!.classList.contains("cm-spacing-collapsed-gap"), current.html)
          .toBe(false);
      }
      expect(html.classes().includes("cm-preview-collapse-before"), current.html)
        .toBe(current.before);
      expect(html.classes(), current.html).not.toContain("cm-preview-collapse-after");
      wrapper.unmount();
    }
  });

  it("aligns active list raw blocks and rendered previews to the same indentation", async () => {
    const source = [
      "- item",
      "  ~~~math",
      "  x + 1",
      "  ~~~",
    ].join("\n");
    const editable = mountEditor(source, false);
    await settleUi();

    const editor = editable.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const formula = source.indexOf("x + 1");
    await editor.selectRange(formula, formula, false);
    await settleUi();

    const rawLines = editable.findAll<HTMLElement>(".cm-list-raw-block");
    expect(rawLines.length).toBeGreaterThan(0);
    rawLines.forEach((line) => {
      expect(line.classes()).toContain("cm-list-depth-0");
      expect(line.element.style.getPropertyValue("--raw-list-indent")).toBe("30px");
    });
    editable.unmount();

    const readonly = mountEditor(source);
    await settleUi();
    const preview = readonly.get<HTMLElement>(
      ".cm-special-preview-math.cm-preview-list-container",
    );
    expect(preview.element.style.getPropertyValue("--preview-list-indent")).toBe("30px");
    readonly.unmount();
  });

  it("collapses quoted blank lines after block widgets symmetrically", async () => {
    const fixtures = [
      {
        source: [
          "> ~~~text",
          "> code",
          "> ~~~",
          ">",
          "> after",
        ].join("\n"),
        widgetClass: "cm-special-preview-code",
      },
      {
        source: [
          "> $$",
          "> x + y",
          "> $$",
          ">",
          "> after",
        ].join("\n"),
        widgetClass: "cm-special-preview-math",
      },
      {
        source: [
          "> | A |",
          "> | --- |",
          "> | one |",
          ">",
          "> after",
        ].join("\n"),
        widgetClass: "cm-visual-table-widget",
      },
    ];

    for (const fixture of fixtures) {
      const wrapper = mountEditor(fixture.source);
      await settleUi();
      const gap = wrapper.get<HTMLElement>(".cm-blockquote-gap");
      expect(
        gap.element.previousElementSibling?.classList.contains(fixture.widgetClass),
        fixture.widgetClass,
      ).toBe(true);
      expect(gap.classes(), fixture.widgetClass).toContain("cm-spacing-collapsed-gap");
      wrapper.unmount();
    }
  });

  it("keeps one spacing edge where quotes directly meet code and table widgets", async () => {
    const fixtures = [
      {
        source: ["> quote", "~~~text", "code", "~~~"].join("\n"),
        boundary: ".cm-blockquote-margin-after",
        sibling: "nextElementSibling",
        widgetClass: "cm-special-preview-code",
        boundaryCollapseClass: "cm-spacing-collapse-after",
        widgetCollapseClass: null,
      },
      {
        source: ["~~~text", "code", "~~~", "> quote"].join("\n"),
        boundary: ".cm-blockquote-margin-before",
        sibling: "previousElementSibling",
        widgetClass: "cm-special-preview-code",
        boundaryCollapseClass: "cm-spacing-collapse-before",
        widgetCollapseClass: null,
      },
      {
        source: ["> quote", "| A |", "| --- |", "| one |"].join("\n"),
        boundary: ".cm-blockquote-margin-after",
        sibling: "nextElementSibling",
        widgetClass: "cm-visual-table-widget",
        boundaryCollapseClass: "cm-spacing-collapse-after",
        widgetCollapseClass: null,
      },
      {
        source: ["| A |", "| --- |", "| one |", "> quote"].join("\n"),
        boundary: ".cm-blockquote-margin-before",
        sibling: "previousElementSibling",
        widgetClass: "cm-visual-table-widget",
        boundaryCollapseClass: "cm-spacing-collapse-before",
        widgetCollapseClass: null,
      },
    ] as const;

    for (const fixture of fixtures) {
      const wrapper = mountEditor(fixture.source);
      await settleUi();
      const boundary = wrapper.get<HTMLElement>(fixture.boundary);
      const sibling = boundary.element[fixture.sibling];
      expect(sibling?.classList.contains(fixture.widgetClass), fixture.source).toBe(true);
      for (const className of ["cm-spacing-collapse-before", "cm-spacing-collapse-after"]) {
        expect(boundary.classes().includes(className), `${fixture.source} ${className}`)
          .toBe(fixture.boundaryCollapseClass === className);
      }
      const widget = wrapper.get(`.${fixture.widgetClass}`);
      for (const className of ["cm-preview-collapse-before", "cm-preview-collapse-after"]) {
        expect(widget.classes().includes(className), `${fixture.source} ${className}`)
          .toBe(fixture.widgetCollapseClass === className);
      }
      wrapper.unmount();
    }
  });

  it("collapses quoted blank and direct spacing around horizontal rules symmetrically", async () => {
    const cases = [
      {
        source: ["> quote", ">", "> ***"].join("\n"),
        selector: ".cm-blockquote-gap",
        sibling: "nextElementSibling",
      },
      {
        source: ["> ***", ">", "> quote"].join("\n"),
        selector: ".cm-blockquote-gap",
        sibling: "previousElementSibling",
      },
      {
        source: ["> quote", "***"].join("\n"),
        selector: ".cm-blockquote-margin-after",
        sibling: "nextElementSibling",
      },
      {
        source: ["***", "> quote"].join("\n"),
        selector: ".cm-blockquote-margin-before",
        sibling: "previousElementSibling",
      },
    ] as const;

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      const boundary = wrapper.get<HTMLElement>(current.selector).element;
      const sibling = boundary[current.sibling];
      expect(sibling?.classList.contains("cm-horizontal-rule"), current.source).toBe(true);
      wrapper.unmount();
    }
  });
});

function mockCompactLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains("cm-scroller") ? 600 : 20;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: height,
      width: 800,
      height,
      toJSON() {
        return this;
      },
    } as DOMRect;
  });
}

function findAdjacentBlockGap(
  root: Element,
  widget: Element,
  edge: "before" | "after",
): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(".cm-line.cm-block-gap"))
    .find((gap) => (
      edge === "before"
        ? gap.nextElementSibling === widget
        : gap.previousElementSibling === widget
    ));
}

function mountEditor(
  source: string,
  readonly = true,
  fontSize = defaultEditorSettings.fontSize,
) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings: {
        ...defaultEditorSettings,
        fontSize,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}
