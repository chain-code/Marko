import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutline, renderMarkdown } from '../src/utils/markdown';
import { defaultEditorSettings } from '../src/utils/editorSettings';
import type { EditorSettings } from '../src/types';

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test('大纲与渲染标题对齐图片替代文本和多行 Setext 标题 ID', () => {
  const source = [
    '# Title ![Logo](logo.png)',
    '',
    'First line',
    'Second line',
    '---',
    '',
    '[TOC]',
  ].join('\n');
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.deepEqual(outline.map((item) => ({ title: item.title, id: item.id })), [
    { title: 'Title Logo', id: 'title-logo' },
    { title: 'First line Second line', id: 'first-line-second-line' },
  ]);
  assert.match(html, /<h1 id=\x22title-logo\x22/);
  assert.match(html, /<h2 id=\x22first-line-second-line\x22/);
  assert.match(html, /href=\x22#title-logo\x22>Title Logo<\/a>/);
  assert.match(html, /href=\x22#first-line-second-line\x22>First line Second line<\/a>/);
});

test('大纲与渲染标题对齐已定义脚注引用', () => {
  const source = [
    '# Heading[^note]',
    '',
    '正文。',
    '',
    '[^note]: 脚注内容',
    '',
    '[TOC]',
  ].join('\n');
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.equal(outline.length, 1);
  assert.equal(outline[0]?.title, 'Heading');
  assert.equal(outline[0]?.id, 'heading');
  assert.match(html, /<h1 id=\x22heading\x22/);
  assert.match(html, /href=\x22#heading\x22>Heading<\/a>/);
});

test("大纲识别列表中的真实标题并排除列表缩进代码", () => {
  const source = [
    "- item",
    "    # Child",
    "-     # Hidden",
    "1. ordered",
    "    ## Ordered child",
    "> - ### Quoted child",
  ].join("\n");

  assert.deepEqual(
    createOutline(source).map((item) => ({ title: item.title, level: item.level })),
    [
      { title: "Child", level: 1 },
      { title: "Ordered child", level: 2 },
      { title: "Quoted child", level: 3 },
    ],
  );
});

test("大纲在列表和引用围栏结束后恢复可见标题", () => {
  const source = [
    "- ~~~md",
    "  # Hidden in list fence",
    "  ~~~",
    "> ~~~md",
    "> # Hidden in quote fence",
    "> ~~~",
    "# Visible",
  ].join("\n");

  assert.deepEqual(createOutline(source).map((item) => item.title), ["Visible"]);
});

test("大纲不会把带尾随文本的围栏标记误判为闭合", () => {
  const source = [
    "~~~md",
    "# Hidden",
    "~~~not-close",
    "# Still hidden",
    "~~~",
    "# Visible",
  ].join("\n");

  assert.deepEqual(createOutline(source).map((item) => item.title), ["Visible"]);
});

test("大纲识别列表和引用中的 Setext 标题", () => {
  const source = [
    "- Bullet title",
    "  ===",
    "1. Ordered title",
    "   ---",
    "> - Quoted title",
    ">   ===",
  ].join("\n");

  assert.deepEqual(
    createOutline(source).map((item) => ({ title: item.title, level: item.level })),
    [
      { title: "Bullet title", level: 1 },
      { title: "Ordered title", level: 2 },
      { title: "Quoted title", level: 1 },
    ],
  );
});
