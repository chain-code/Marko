import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import ContinuousMarkdownEditor from '@/components/ContinuousMarkdownEditor.vue';
import continuousEditorSource from '@/components/ContinuousMarkdownEditor.vue?raw';
import { defaultEditorSettings } from '@/utils/editorSettings';

function mountReadonlyEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: true,
      settings: defaultEditorSettings,
    },
  });
}

function mountEditableEditor(source: string) {
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

function styleRule(selector: string): string {
  const styleSource = continuousEditorSource.slice(continuousEditorSource.indexOf("<style scoped>"));
  const marker = `${selector} {`;
  const start = styleSource.indexOf(marker);
  if (start < 0) return "";
  const bodyStart = start + marker.length;
  return styleSource.slice(bodyStart, styleSource.indexOf("}", bodyStart));
}

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

describe('ContinuousMarkdownEditor layout parity', () => {
  it('cycles bullet shapes by unordered ancestors without losing total indentation', async () => {
    const source = [
      '1. ordered parent',
      '   - first bullet',
      '     1. nested ordered',
      '        - second bullet',
    ].join('\n');
    const wrapper = mountReadonlyEditor(source);
    await settleUi();

    const markers = wrapper.findAll<HTMLElement>('.cm-rendered-bullet-marker');
    expect(markers.map((marker) => marker.text())).toEqual(['\u2022', '\u25e6']);
    expect(markers.map((marker) => marker.element.style.getPropertyValue('--list-marker-width')))
      .toEqual(['3.75rem', '7.5rem']);
    expect(markers.map((marker) => marker.attributes('data-list-depth')))
      .toEqual(['0', '1']);
    wrapper.unmount();
  });

  it('compacts list type and footnote block boundaries', async () => {
    const listSource = [
      '- bullet',
      '',
      '1. ordered',
    ].join('\n');
    const listWrapper = mountReadonlyEditor(listSource);
    await settleUi();
    const listGaps = listWrapper.findAll('.cm-line')
      .filter((line) => line.classes().includes('cm-block-gap'));
    expect(listGaps.length).toBeGreaterThanOrEqual(1);
    listWrapper.unmount();

    const footnoteWrapper = mountReadonlyEditor('[^n]: note\n\nAfter');
    await settleUi();
    expect(footnoteWrapper.get('.cm-footnote-definition-widget').classes())
      .toContain('cm-definition-following-gap');
    expect(footnoteWrapper.findAll('.cm-line').some((line) => line.text() === 'After'))
      .toBe(true);
    footnoteWrapper.unmount();

    const referenceWrapper = mountReadonlyEditor('[docs]: /guide\n\nAfter');
    await settleUi();
    expect(referenceWrapper.get('.cm-reference-definition').classes())
      .toContain('cm-definition-following-gap');
    expect(referenceWrapper.findAll('.cm-line').some((line) => line.text() === 'After'))
      .toBe(true);
    referenceWrapper.unmount();
  });

  it('collapses only inactive source gaps beside rendered blocks with their own spacing', async () => {
    for (const fixture of [
      {
        source: ['Before', '', '```js', 'alpha', '```'].join('\n'),
        sibling: 'cm-special-preview',
      },
      {
        source: ['Before', '', '| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'),
        sibling: 'cm-visual-table-widget',
      },
    ]) {
      const wrapper = mountReadonlyEditor(fixture.source);
      await settleUi();
      const hasAdjacentGap = wrapper.findAll('.cm-block-gap').some((gap) => {
        const adjacentClasses = [
          gap.element.previousElementSibling?.classList,
          gap.element.nextElementSibling?.classList,
        ];
        return adjacentClasses.some((classes) => classes?.contains(fixture.sibling));
      });
      expect(hasAdjacentGap, fixture.sibling).toBe(true);
      wrapper.unmount();
    }

    const styleSource = continuousEditorSource.slice(continuousEditorSource.indexOf('<style scoped>'));
    expect(styleSource).toMatch(
      /\.cm-line\.cm-spacing-collapsed-gap:not\(\.cm-active-markdown-line\)/,
    );
    expect(styleSource).toMatch(
      /\.cm-horizontal-rule \+ \.cm-line\.cm-block-gap:not\(\.cm-active-markdown-line\)[\s\S]*?height:\s*0;/,
    );
  });

  it("keeps collapsed gap heights stable when the cursor enters them", async () => {
    const fixtures = [
      { source: "# Heading\n\nBody", gapClass: "cm-heading-gap" },
      { source: "Before\n\nBody", gapClass: "cm-block-gap" },
      { source: "- First\n\n- Second", gapClass: "cm-list-gap" },
      { source: "> Quote\n>\n> Next", gapClass: "cm-blockquote-gap" },
    ];

    for (const fixture of fixtures) {
      const wrapper = mountEditableEditor(fixture.source);
      await settleUi();
      const cursor = fixture.source.indexOf("\n") + 1;
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      await editor.selectRange(cursor, cursor, false);
      await settleUi();

      const activeGap = wrapper.findAll(".cm-line").find((line) => (
        line.classes().includes(fixture.gapClass)
        && line.classes().includes("cm-active-markdown-line")
      ));
      expect(activeGap, fixture.gapClass).toBeDefined();
      wrapper.unmount();
    }

    expect(styleRule(":deep(.cm-line.cm-heading-gap.cm-active-markdown-line)")).toMatch(/height:\s*1px;/);
    expect(styleRule(":deep(.cm-line.cm-block-gap.cm-active-markdown-line:not(.cm-block-gap-extra))")).toMatch(/height:\s*0\.8em;/);
    expect(styleRule(":deep(.cm-list-gap.cm-active-markdown-line)")).toMatch(/height:\s*0\.5rem;/);
    expect(styleRule(":deep(.cm-blockquote-gap.cm-active-markdown-line)")).toMatch(/height:\s*0\.8em;/);
    expect(styleRule(":deep(.cm-line.cm-spacing-collapsed-gap.cm-active-markdown-line)")).toMatch(/height:\s*0;/);
  });
});
