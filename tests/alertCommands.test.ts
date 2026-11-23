import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { insertMarkdownCalloutTemplate } from "../src/utils/editorCommands";

test("insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert", () => {
  for (const kind of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    const result = insertMarkdownCalloutTemplate({
      value: "Intro",
      selectionStart: 5,
      selectionEnd: 5,
    }, kind.toLowerCase());
    assert.equal(result.value, `> [!${kind}]\n> Intro`);
    assert.equal(result.selectionStart, result.value.length);
    assert.equal(result.selectionEnd, result.value.length);
  }
});

test("Alert 对无效类型回退到 NOTE 并保留 CRLF", () => {
  const source = "Intro\r\n";
  const result = insertMarkdownCalloutTemplate({
    value: source,
    selectionStart: source.length,
    selectionEnd: source.length,
  }, "unknown");

  assert.match(result.value, /> \[!NOTE\]/);
  assert.doesNotMatch(result.value, /(?<!\r)\n/);
});

test("Alert 将选中的多个段落转换为一个连续引用块", () => {
  const source = "Alpha\n\nBeta";
  const result = insertMarkdownCalloutTemplate({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  }, "TIP");

  assert.deepEqual(result, {
    value: "> [!TIP]\n> Alpha\n> \n> Beta",
    selectionStart: "> [!TIP]\n> ".length,
    selectionEnd: "> [!TIP]\n> Alpha\n> \n> Beta".length,
  });
});

test("Alert 可切换类型，并在再次选择同类型时还原普通段落", () => {
  const source = "> [!NOTE]\n> Alpha\n>\n> Beta";
  const cursor = source.indexOf("Alpha") + 2;
  const switched = insertMarkdownCalloutTemplate({
    value: source,
    selectionStart: cursor,
    selectionEnd: cursor,
  }, "WARNING");

  assert.equal(switched.value, "> [!WARNING]\n> Alpha\n>\n> Beta");
  assert.equal(switched.value.slice(switched.selectionStart - 2, switched.selectionStart + 3), "Alpha");

  const restored = insertMarkdownCalloutTemplate({
    value: switched.value,
    selectionStart: switched.selectionStart,
    selectionEnd: switched.selectionEnd,
  }, "WARNING");
  assert.equal(restored.value, "Alpha\n\nBeta");
  assert.equal(restored.value[restored.selectionStart], "p");
});

test("Alert 将已有普通引用升级为提示而不增加引用层级", () => {
  const source = "> Alpha\n> Beta";
  const result = insertMarkdownCalloutTemplate({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  }, "IMPORTANT");

  assert.equal(result.value, "> [!IMPORTANT]\n> Alpha\n> Beta");
});

test("Alert 类型从工具栏 payload 传递到两种编辑器命令路径", () => {
  const toolbar = readFileSync(resolve("src/components/AppToolbar.vue"), "utf8");
  const app = readFileSync(resolve("src/App.vue"), "utf8");
  const continuous = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");
  const block = readFileSync(resolve("src/components/BlockEditor.vue"), "utf8");

  for (const kind of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    assert.match(toolbar, new RegExp(`emit\\("command", "callout", "${kind}"\\)`));
  }
  assert.match(app, /runCommand\(command, payload\)/);
  assert.match(continuous, /case "callout": return insertMarkdownCalloutTemplate\(state, payload\)/);
  assert.match(block, /case "callout":[\s\S]{0,80}insertCalloutTemplate\(payload\)/);
});
