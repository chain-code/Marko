import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMarkdownSpaceShortcutAfterInput,
  applyMarkdownSpaceShortcut,
  applyMarkdownTextInputShortcut,
  continueMarkdownBlock,
  insertMarkdownSoftBreak,
} from "../src/utils/editorCommands";
import {
  readMarkdownContainerPrefix,
  stripMarkdownListContainerMarkers,
} from "../src/utils/markdownIndent";

test("星号无序列表保留输入标记并在 Enter 后续写同格式", () => {
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "*", selectionStart: 1, selectionEnd: 1 }),
    { value: "* ", selectionStart: 2, selectionEnd: 2 },
  );

  for (const { source, expected } of [
    { source: "* 一级", expected: "* 一级\n* " },
    { source: "* 一级\n  * 二级", expected: "* 一级\n  * 二级\n  * " },
    {
      source: "* 一级\n  * 二级\n    * 三级",
      expected: "* 一级\n  * 二级\n    * 三级\n    * ",
    },
    { source: "- 一级\n * 二级", expected: "- 一级\n * 二级\n * " },
    {
      source: "- 一级\n * 二级\n  * 三级",
      expected: "- 一级\n * 二级\n  * 三级\n  * ",
    },
    { source: "> * 引用项", expected: "> * 引用项\n> * " },
  ]) {
    assert.deepEqual(
      continueMarkdownBlock({
        value: source,
        selectionStart: source.length,
        selectionEnd: source.length,
      }),
      {
        value: expected,
        selectionStart: expected.length,
        selectionEnd: expected.length,
      },
    );
  }
});

test("空的紧凑二三级列表标记仍按完整容器解析", () => {
  for (const source of ["* * ", "  * * ", "> * * "]) {
    const prefix = readMarkdownContainerPrefix(source);
    assert.equal(
      prefix.markers.filter((marker) => marker.kind === "bullet-list").length,
      2,
      source,
    );
    assert.equal(prefix.content, "", source);
  }

  assert.deepEqual(stripMarkdownListContainerMarkers("* * "), {
    content: "",
    prefixLength: 4,
    continuationIndentWidth: 4,
    codeIndented: false,
  });
});

test("已有紧凑嵌套源码仍能从最内层续写", () => {
  for (const { source, expected, indentSize = 2 } of [
    {
      source: "* level-one\n* * level-two",
      expected: "* level-one\n* * level-two\n  * ",
    },
    {
      source: "* level-one\n* * level-two\n  * * level-three",
      expected: "* level-one\n* * level-two\n  * * level-three\n    * ",
    },
    {
      source: "- level-one\n- * level-two",
      expected: "- level-one\n- * level-two\n  * ",
    },
    {
      source: "* level-one\n* * [x] complete",
      expected: "* level-one\n* * [x] complete\n  * [ ] ",
    },
    {
      source: "> * quoted-one\n> * * quoted-two",
      expected: "> * quoted-one\n> * * quoted-two\n>   * ",
    },
    {
      source: "* level-one\r\n* * level-two",
      expected: "* level-one\r\n* * level-two\r\n  * ",
    },
    {
      source: "* level-one\n* * level-two",
      expected: "* level-one\n* * level-two\n    * ",
      indentSize: 4,
    },
  ]) {
    assert.deepEqual(
      continueMarkdownBlock({
        value: source,
        selectionStart: source.length,
        selectionEnd: source.length,
      }, indentSize),
      {
        value: expected,
        selectionStart: expected.length,
        selectionEnd: expected.length,
      },
      source,
    );
  }

});

test("空列表项输入星号空格时转换为只含内层标记的标准缩进", () => {
  for (const { source, expected, indentSize = 2 } of [
    { source: "* level-one\n* *", expected: "* level-one\n  * " },
    { source: "- level-one\n- *", expected: "- level-one\n  * " },
    {
      source: "* level-one\n  * level-two\n  * *",
      expected: "* level-one\n  * level-two\n    * ",
    },
    { source: "> * quoted-one\n> * *", expected: "> * quoted-one\n>   * " },
    { source: "* level-one\r\n* *", expected: "* level-one\r\n  * " },
    { source: "* level-one\n* *", expected: "* level-one\n    * ", indentSize: 4 },
  ]) {
    assert.deepEqual(
      applyMarkdownSpaceShortcut({
        value: source,
        selectionStart: source.length,
        selectionEnd: source.length,
      }, indentSize),
      {
        value: expected,
        selectionStart: expected.length,
        selectionEnd: expected.length,
      },
      source,
    );
  }
});

test("批量输入星号嵌套项时同样转换为标准缩进", () => {
  for (const { source, text, expected } of [
    { source: "* level-one\n* *", text: " ", expected: "* level-one\n  * " },
    {
      source: "* level-one\n  * level-two\n  * *",
      text: " ",
      expected: "* level-one\n  * level-two\n    * ",
    },
    { source: "* level-one\n* ", text: "* ", expected: "* level-one\n  * " },
    {
      source: "* level-one\n  * level-two\n  * ",
      text: "* ",
      expected: "* level-one\n  * level-two\n    * ",
    },
    { source: "- level-one\n- ", text: "* level-two", expected: "- level-one\n  * level-two" },
    {
      source: "* level-one\n  * level-two\n  * ",
      text: "* level-three",
      expected: "* level-one\n  * level-two\n    * level-three",
    },
  ]) {
    assert.deepEqual(
      applyMarkdownTextInputShortcut({
        value: source,
        selectionStart: source.length,
        selectionEnd: source.length,
      }, text),
      {
        value: expected,
        selectionStart: expected.length,
        selectionEnd: expected.length,
      },
      source + " + " + text,
    );
  }

  for (const text of ["x", "plain text"]) {
    assert.equal(
      applyMarkdownTextInputShortcut({
        value: "* level-one\n* *",
        selectionStart: "* level-one\n* *".length,
        selectionEnd: "* level-one\n* *".length,
      }, text),
      null,
      text,
    );
  }
});

test("输入后的空格修正会将交互生成的紧凑标记转换为标准缩进", () => {
  for (const { source, expected } of [
    { source: "* level-one\n* * ", expected: "* level-one\n  * " },
    {
      source: "* level-one\n  * level-two\n  * * ",
      expected: "* level-one\n  * level-two\n    * ",
    },
    { source: "> - quoted-one\n> - * ", expected: "> - quoted-one\n>   * " },
  ]) {
    assert.deepEqual(
      applyMarkdownSpaceShortcutAfterInput({
        value: source,
        selectionStart: source.length,
        selectionEnd: source.length,
      }),
      {
        value: expected,
        selectionStart: expected.length,
        selectionEnd: expected.length,
      },
      source,
    );
  }
});
test("nested bullet Space input ignores invalid nesting contexts", () => {
  for (const { source, cursor = source.length } of [
    { source: "* *" },
    { source: "* parent\n  * *" },
    { source: "1. ordered\n* *" },
    { source: "* item\n\nparagraph\n* *" },
    { source: "* body *" },
    { source: "* level-one\n* *tail", cursor: "* level-one\n* *".length },
    { source: "> * parent\n>   * *" },
  ]) {
    assert.equal(
      applyMarkdownSpaceShortcut({
        value: source,
        selectionStart: cursor,
        selectionEnd: cursor,
      }),
      null,
      source,
    );
  }
});

test("嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进", () => {
  for (const marker of ["*", "-"]) {
    const second = marker + " level-one\n  " + marker + " level-two";
    const secondContinued = second + "\n  " + marker + " ";
    assert.deepEqual(
      continueMarkdownBlock({
        value: second,
        selectionStart: second.length,
        selectionEnd: second.length,
      }),
      {
        value: secondContinued,
        selectionStart: secondContinued.length,
        selectionEnd: secondContinued.length,
      },
    );

    const exitedSecond = second + "\n  ";
    assert.deepEqual(
      continueMarkdownBlock({
        value: secondContinued,
        selectionStart: secondContinued.length,
        selectionEnd: secondContinued.length,
      }),
      {
        value: exitedSecond,
        selectionStart: exitedSecond.length,
        selectionEnd: exitedSecond.length,
      },
    );

    const third = second + "\n    " + marker + " level-three";
    const thirdContinued = third + "\n    " + marker + " ";
    assert.deepEqual(
      continueMarkdownBlock({
        value: third,
        selectionStart: third.length,
        selectionEnd: third.length,
      }),
      {
        value: thirdContinued,
        selectionStart: thirdContinued.length,
        selectionEnd: thirdContinued.length,
      },
    );

    const exitedThird = third + "\n    ";
    assert.deepEqual(
      continueMarkdownBlock({
        value: thirdContinued,
        selectionStart: thirdContinued.length,
        selectionEnd: thirdContinued.length,
      }),
      {
        value: exitedThird,
        selectionStart: exitedThird.length,
        selectionEnd: exitedThird.length,
      },
    );
  }
});
test("引用内嵌套列表 Enter 续写标记，空项保留当前缩进", () => {
  const nested = "> - level-one\n>   - level-two";
  const continued = nested + "\n>   - ";
  assert.deepEqual(
    continueMarkdownBlock({
      value: nested,
      selectionStart: nested.length,
      selectionEnd: nested.length,
    }),
    {
      value: continued,
      selectionStart: continued.length,
      selectionEnd: continued.length,
    },
  );

  const exited = nested + "\n>   ";
  assert.deepEqual(
    continueMarkdownBlock({
      value: continued,
      selectionStart: continued.length,
      selectionEnd: continued.length,
    }),
    {
      value: exited,
      selectionStart: exited.length,
      selectionEnd: exited.length,
    },
  );
});
test("星号无序列表空项退出且 Shift+Enter 只创建软换行", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "* ", selectionStart: 2, selectionEnd: 2 }),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    continueMarkdownBlock({
      value: "* 一级\n  * ",
      selectionStart: "* 一级\n  * ".length,
      selectionEnd: "* 一级\n  * ".length,
    }),
    {
      value: "* 一级\n  ",
      selectionStart: "* 一级\n  ".length,
      selectionEnd: "* 一级\n  ".length,
    },
  );
  assert.deepEqual(
    continueMarkdownBlock({
      value: "> * ",
      selectionStart: "> * ".length,
      selectionEnd: "> * ".length,
    }),
    { value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length },
  );

  const softBreak = "* 一级  \n  ";
  assert.deepEqual(
    insertMarkdownSoftBreak({
      value: "* 一级",
      selectionStart: "* 一级".length,
      selectionEnd: "* 一级".length,
    }),
    {
      value: softBreak,
      selectionStart: softBreak.length,
      selectionEnd: softBreak.length,
    },
  );
});

test("空列表项在标记前按 Enter 也会退出并保留当前缩进", () => {
  for (const { source, cursor, expected, expectedCursor = expected.length } of [
    {
      source: "* root\n  * child\n    * ",
      cursor: "* root\n  * child\n    ".length,
      expected: "* root\n  * child\n    ",
    },
    {
      source: "> * root\n>   * child\n>     * ",
      cursor: "> * root\n>   * child\n>     ".length,
      expected: "> * root\n>   * child\n>     ",
    },
    {
      source: "- [ ] root\n  - [ ] ",
      cursor: "- [ ] root\n  ".length,
      expected: "- [ ] root\n  ",
    },
    {
      source: "1. root\n  1. child\n    1. ",
      cursor: "1. root\n  1. child\n    ".length,
      expected: "1. root\n  1. child\n    ",
    },
    {
      source: "* root\r\n  * child\r\n    * \r\ntail",
      cursor: "* root\r\n  * child\r\n    ".length,
      expected: "* root\r\n  * child\r\n    \r\ntail",
      expectedCursor: "* root\r\n  * child\r\n    ".length,
    },
  ]) {
    assert.deepEqual(
      continueMarkdownBlock({ value: source, selectionStart: cursor, selectionEnd: cursor }),
      { value: expected, selectionStart: expectedCursor, selectionEnd: expectedCursor },
    );
  }
});
