import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDefaultCodeLanguageOnFenceKey,
  continueMarkdownBlock,
} from "../src/utils/editorCommands";
import { getRawBlockSelection } from "../src/utils/rawBlockEditing";

test("反引号围栏信息字符串包含反引号时不进入原始块", () => {
  const backtick = String.fromCharCode(96);
  const fence = backtick.repeat(3);
  const opening = fence + "js" + backtick + "bad";
  const source = opening + "\n- item";
  const item = source.indexOf("item");

  assert.equal(continueMarkdownBlock({
    value: opening,
    selectionStart: opening.length,
    selectionEnd: opening.length,
  }), null);
  assert.equal(getRawBlockSelection({
    value: source,
    selectionStart: item,
    selectionEnd: item,
  }), null);
  assert.deepEqual(continueMarkdownBlock({
    value: source,
    selectionStart: source.length,
    selectionEnd: source.length,
  }), {
    value: source + "\n- ",
    selectionStart: source.length + 3,
    selectionEnd: source.length + 3,
  });
});

test("波浪线围栏允许信息字符串包含反引号", () => {
  const opening = "~~~js" + String.fromCharCode(96) + "valid";
  const source = opening + "\ncode\n~~~";
  const code = source.indexOf("code");
  const raw = getRawBlockSelection({
    value: source,
    selectionStart: code,
    selectionEnd: code,
  });

  assert.equal(raw?.kind, "code");
  assert.equal(raw?.closed, true);
  assert.deepEqual(continueMarkdownBlock({
    value: opening,
    selectionStart: opening.length,
    selectionEnd: opening.length,
  }), {
    value: opening + "\n\n~~~",
    selectionStart: opening.length + 1,
    selectionEnd: opening.length + 1,
  });
});

test("列表容器内的原始围栏按实际续行列宽闭合", () => {
  const backtick = String.fromCharCode(96);
  const fence = backtick.repeat(3);
  const cases = [
    "1. $$\n   x = 1\n   $$",
    "10. $$\n    x = 1\n    $$",
    "123456789. $$\n           x = 1\n           $$",
    "> 10. $$\n>     x = 1\n>     $$",
    "10. " + fence + "js\n    code\n    " + fence,
  ];

  for (const source of cases) {
    const cursor = source.includes("x = 1") ? source.indexOf("x = 1") : source.indexOf("code");
    const raw = getRawBlockSelection({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    });

    assert.ok(raw, source);
    assert.equal(raw.closed, true, source);
  }
});

test("代码围栏闭合行只允许尾随空白", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const unclosed = fence + "js\ncode\n" + fence + "not-close\n- item";
  assert.equal(continueMarkdownBlock({
    value: unclosed,
    selectionStart: unclosed.length,
    selectionEnd: unclosed.length,
  }), null);

  const closed = fence + "js\ncode\n" + fence + " \t\n- item";
  assert.deepEqual(continueMarkdownBlock({
    value: closed,
    selectionStart: closed.length,
    selectionEnd: closed.length,
  }), {
    value: closed + "\n- ",
    selectionStart: closed.length + 3,
    selectionEnd: closed.length + 3,
  });
});

test("四列缩进后的伪引用不会触发围栏自动补全", () => {
  const fence = String.fromCharCode(96).repeat(3);
  for (const source of [
    "    > " + fence,
    "\t> " + fence,
    "    > $$",
    "\t> \\[",
  ]) {
    assert.equal(continueMarkdownBlock({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    }), null, JSON.stringify(source));
  }
});

test("三列缩进内的引用围栏仍会自动补全", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = "   > " + fence;
  const expected = source + "\n   > \n   > " + fence;

  assert.deepEqual(continueMarkdownBlock({
    value: source,
    selectionStart: source.length,
    selectionEnd: source.length,
  }), {
    value: expected,
    selectionStart: source.length + "\n   > ".length,
    selectionEnd: source.length + "\n   > ".length,
  });
});

test("多位有序列表围栏闭合后恢复正文块 Enter 语义", () => {
  const backtick = String.fromCharCode(96).repeat(3);
  const dollar = String.fromCharCode(36).repeat(2);
  for (const source of [
    "10. " + dollar + "\n    x = 1\n    " + dollar + "\n- item",
    "123456789. " + backtick + "md\n           code\n           " + backtick + "\n- item",
  ]) {
    assert.deepEqual(continueMarkdownBlock({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    }), {
      value: source + "\n- ",
      selectionStart: source.length + 3,
      selectionEnd: source.length + 3,
    }, source);
  }

  const quoted = "> 10. " + dollar + "\n>     x = 1\n>     " + dollar + "\n> - item";
  assert.deepEqual(continueMarkdownBlock({
    value: quoted,
    selectionStart: quoted.length,
    selectionEnd: quoted.length,
  }), {
    value: quoted + "\n> - ",
    selectionStart: quoted.length + 5,
    selectionEnd: quoted.length + 5,
  });
});

test("列表与引用中的未闭合围栏不会污染容器外正文", () => {
  const fence = String.fromCharCode(96).repeat(3);
  for (const source of [
    "10. " + fence + "md\n    code\n- item",
    "> " + fence + "md\n> code\n- item",
  ]) {
    assert.deepEqual(continueMarkdownBlock({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    }), {
      value: source + "\n- ",
      selectionStart: source.length + 3,
      selectionEnd: source.length + 3,
    }, source);
  }

  const topLevel = fence + "md\ncode\n- item";
  assert.equal(continueMarkdownBlock({
    value: topLevel,
    selectionStart: topLevel.length,
    selectionEnd: topLevel.length,
  }), null);
});
test("围栏正文中的引用与列表标记保持字面内容", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const cases = [
    fence + "md\n> - item",
    "$$\n> - item",
    "\\[\n> - item",
    "> " + fence + "md\n> > - item",
    "1. " + fence + "md\n   > - item",
    "- $$\n  > - item",
  ];

  for (const source of cases) {
    assert.equal(continueMarkdownBlock({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    }), null, source);
  }

  const quoted = "> " + fence + "md\n> > literal\n> " + fence;
  const quotedCursor = quoted.indexOf("literal");
  const quotedRaw = getRawBlockSelection({
    value: quoted,
    selectionStart: quotedCursor,
    selectionEnd: quotedCursor,
  });
  assert.equal(quotedRaw?.closed, true);
  assert.equal(quotedRaw?.content, "> literal");

  const listed = "1. " + fence + "md\n   > literal\n   " + fence;
  const listedCursor = listed.indexOf("literal");
  const listedRaw = getRawBlockSelection({
    value: listed,
    selectionStart: listedCursor,
    selectionEnd: listedCursor,
  });
  assert.equal(listedRaw?.closed, true);
  assert.match(listedRaw?.content ?? "", /> literal/);

  for (const source of [
    fence + "md\n> " + String.fromCharCode(96).repeat(2),
    "> " + fence + "md\n> > " + String.fromCharCode(96).repeat(2),
  ]) {
    assert.equal(applyDefaultCodeLanguageOnFenceKey({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    }, String.fromCharCode(96), "typescript"), null, source);
  }
});

test("引用后的 Tab stop 按绝对列补全围栏", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const cases = [
    {
      source: "> \t" + fence,
      expected: "> \t" + fence + "\n> \t\n> \t" + fence,
    },
    {
      source: ">  \t$$",
      expected: ">  \t$$\n>  \t\n>  \t$$",
    },
    {
      source: "> \t\\[",
      expected: "> \t\\[\n> \t\n> \t\\]",
    },
  ];

  for (const { source, expected } of cases) {
    const result = continueMarkdownBlock({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    });
    assert.equal(result?.value, expected, source);
  }

  const defaultLanguage = "> \t" + String.fromCharCode(96).repeat(2);
  assert.equal(
    applyDefaultCodeLanguageOnFenceKey({
      value: defaultLanguage,
      selectionStart: defaultLanguage.length,
      selectionEnd: defaultLanguage.length,
    }, String.fromCharCode(96), "typescript")?.value,
    "> \t" + fence + "typescript",
  );
});

test("容器外的新围栏不会被容器内未闭合状态拦截", () => {
  const fence = String.fromCharCode(96).repeat(3);
  for (const source of [
    "10. " + fence + "md\n    code\n" + fence,
    "> " + fence + "md\n> code\n" + fence,
    "10. $$\n    x\n$$",
    "> $$\n> x\n$$",
    "10. \\[\n    x\n\\[",
    "> \\[\n> x\n\\[",
  ]) {
    const result = continueMarkdownBlock({
      value: source,
      selectionStart: source.length,
      selectionEnd: source.length,
    });
    assert.ok(result, source);
  }
});

test("已有围栏闭合行使用严格且容器无关的缩进判断", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const valid = [
    fence + "md\n  " + fence,
    "> \t" + fence + "md\n> " + fence,
    "> \t$$\n> $$",
    "> \t\\[\n> \\]",
  ];
  for (const source of valid) {
    const cursor = source.indexOf("\n");
    assert.equal(continueMarkdownBlock({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    }), null, source);
  }

  for (const source of [
    fence + "md\n" + fence + " trailing",
    "$$\n$$ trailing",
    "\\[\n\\] trailing",
  ]) {
    const cursor = source.indexOf("\n");
    assert.ok(continueMarkdownBlock({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    }), source);
  }
});
