// 编辑器的交互测试（1.13 节）：在真实的浏览器里点击、拖选、输入法组合、拖放、NodeView 的焦点、gapcursor。
// 测试页是 playground/（window.markoTest）
import { expect, test, type Page } from "@playwright/test";

interface Snapshot {
  value: string;
  anchor: number;
  head: number;
}

async function load(page: Page, markdown: string, cursor?: number): Promise<void> {
  await page.goto("/?source=0&doc=empty");
  await page.waitForFunction(() => window.markoTest !== undefined);
  await page.evaluate(
    ([text, at]) => {
      window.markoTest.setMarkdown(text, at === null ? undefined : { anchor: at, head: at });
      window.markoTest.editor.view.focus();
    },
    [markdown, cursor ?? null] as const,
  );
}

/** 等浏览器的 selectionchange 传到编辑器（它是异步的）、装饰重画完 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function read(page: Page): Promise<Snapshot> {
  await settle(page);
  return page.evaluate(() => window.markoTest.read());
}

/** 编辑区里第 occurrence 处文字 text 中第 offset 个字符前面的屏幕坐标 */
async function pointAt(page: Page, text: string, offset = 0, occurrence = 0): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ([needle, at, nth]) => {
      const walker = document.createTreeWalker(document.querySelector("#write") as Node, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node.textContent ?? "").indexOf(needle);
        if (index < 0) continue;
        if (seen++ < nth) continue;
        const range = document.createRange();
        range.setStart(node, index + at);
        range.setEnd(node, index + at);
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
        return { x: rect.left, y: rect.top + rect.height / 2 };
      }
      return null;
    },
    [text, offset, occurrence] as const,
  );
  if (!point) throw new Error(`页面上找不到「${text}」`);
  return point;
}

async function visibleMarks(page: Page): Promise<string[]> {
  return page.locator("#write .md-mark:not(.md-hidden)").allTextContents();
}

test.describe("E-2 片段的展开和收起", () => {
  test("单击收起的粗体文字：光标落在点到的字上，标记展开", async ({ page }) => {
    await load(page, "a **bold** c\n\nend", "a **bold** c\n\n".length);
    expect(await visibleMarks(page)).toEqual([]);
    const point = await pointAt(page, "bold", 2);
    await page.mouse.click(point.x, point.y);
    const snapshot = await read(page);
    expect(snapshot.anchor).toBe("a **bo".length);
    expect(await visibleMarks(page)).toEqual(["**", "**"]);
  });

  test("方向键挨上片段时展开，接着一个字符一个字符走过标记", async ({ page }) => {
    await load(page, "a **b** c", 9);
    const steps: Array<[number, number]> = [];
    for (let step = 0; step < 9; step += 1) {
      await page.keyboard.press("ArrowLeft");
      steps.push([(await read(page)).anchor, (await visibleMarks(page)).length]);
    }
    // 偏移 2～7 挨着或在片段里：两个 `**` 都显示
    expect(steps).toEqual([
      [8, 0],
      [7, 2],
      [6, 2],
      [5, 2],
      [4, 2],
      [3, 2],
      [2, 2],
      [1, 0],
      [0, 0],
    ]);
  });

  test("输入的文字进到光标处；行内样式马上显示", async ({ page }) => {
    await load(page, "end", 0);
    await page.keyboard.type("**x** ");
    expect((await read(page)).value).toBe("**x** end");
    await expect(page.locator("#write strong")).toHaveText("x");
  });
});

test.describe("E-7 选择", () => {
  test("拖选跨过收起的片段：选区的两端是点到的字", async ({ page }) => {
    await load(page, "alpha **beta** gamma\n\nend", "alpha **beta** gamma\n\n".length);
    const from = await pointAt(page, "alpha", 2);
    const to = await pointAt(page, "gamma", 3);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const snapshot = await read(page);
    expect([snapshot.anchor, snapshot.head]).toEqual([2, "alpha **beta** gam".length]);
  });
});

test.describe("E-12 输入法", () => {
  test("组合输入的文字上屏后进到文档里", async ({ page }) => {
    await load(page, "x", 1);
    const client = await page.context().newCDPSession(page);
    await client.send("Input.imeSetComposition", { text: "ni", selectionStart: 2, selectionEnd: 2 });
    await client.send("Input.imeSetComposition", { text: "nihao", selectionStart: 5, selectionEnd: 5 });
    await client.send("Input.insertText", { text: "你好" });
    await expect.poll(async () => (await read(page)).value).toBe("x你好");
    expect((await read(page)).anchor).toBe(3);
  });

  test("上屏的左括号按直接输入的处理：补上右半边", async ({ page }) => {
    await load(page, "x", 1);
    const client = await page.context().newCDPSession(page);
    await client.send("Input.imeSetComposition", { text: "(", selectionStart: 1, selectionEnd: 1 });
    await client.send("Input.insertText", { text: "（" });
    await expect.poll(async () => (await read(page)).value).toBe("x（）");
    expect((await read(page)).anchor).toBe(2);
  });

  test("上屏以后按 Markdown 对齐：段落开头上屏「# 」变成标题", async ({ page }) => {
    await load(page, "", 0);
    const client = await page.context().newCDPSession(page);
    await client.send("Input.imeSetComposition", { text: "# biao", selectionStart: 6, selectionEnd: 6 });
    await client.send("Input.insertText", { text: "# 标题" });
    await expect.poll(async () => page.evaluate(() => window.markoTest.editor.state.doc.firstChild?.type.name)).toBe("heading");
    expect((await read(page)).value).toBe("# 标题");
  });
});

test.describe("B-6 代码块", () => {
  test("方向键进出代码块：焦点在 CodeMirror 里，输入进代码", async ({ page }) => {
    await load(page, "para\n\n```js\nlet a;\n```\n\nafter", 4);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#write .cm-editor.cm-focused")).toHaveCount(1);
    await page.keyboard.type("x");
    expect((await read(page)).value).toBe("para\n\n```js\nxlet a;\n```\n\nafter");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#write .cm-editor.cm-focused")).toHaveCount(0);
    await page.keyboard.type("y");
    expect((await read(page)).value).toBe("para\n\n```js\nxlet a;\n```\n\nyafter");
  });

  test("文档以代码块结尾时，在最后一行按 ↓ 在后面新建正文段落", async ({ page }) => {
    await load(page, "```\ncode\n```", 6);
    await expect(page.locator("#write .cm-editor.cm-focused")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("z");
    expect((await read(page)).value).toBe("```\ncode\n```\n\nz");
  });

  test("CodeMirror 里的撤销走编辑器的历史", async ({ page }) => {
    await load(page, "```\ncode\n```", 8);
    await page.keyboard.type("123");
    expect((await read(page)).value).toBe("```\ncode123\n```");
    await page.keyboard.press("Control+z");
    expect((await read(page)).value).toBe("```\ncode\n```");
  });
});

test.describe("B-7 公式块", () => {
  test("光标不在里面时显示公式；单击进去编辑源码，下面实时预览", async ({ page }) => {
    await load(page, "$$\nx^2\n$$\n\nend", "$$\nx^2\n$$\n\n".length);
    const block = page.locator("#write .md-math-block");
    await expect(block).not.toHaveClass(/md-editing/);
    await expect(block.locator(".md-math-container mjx-container")).toHaveCount(1);
    await block.locator(".md-math-container").click();
    await expect(block).toHaveClass(/md-editing/);
    await page.keyboard.type("+1");
    expect((await read(page)).value).toBe("$$\nx^2+1\n$$\n\nend");
    // 离开以后收起
    await page.evaluate(() => {
      const { editor } = window.markoTest;
      editor.commands.focus("end");
    });
    await expect(block).not.toHaveClass(/md-editing/);
  });
});

test.describe("B-5 任务列表", () => {
  test("单击复选框切换，只改 [ ] 里的字符，光标不动", async ({ page }) => {
    await load(page, "- [ ] task\n\nend", "- [ ] task\n\nend".length);
    await page.locator("#write li.task-list-item > input").click();
    const snapshot = await read(page);
    expect(snapshot.value).toBe("- [x] task\n\nend");
    expect(snapshot.anchor).toBe("- [x] task\n\nend".length);
    await expect(page.locator("#write li.task-list-item > input")).toBeChecked();
  });
});

test.describe("N-4 链接", () => {
  test("Ctrl+单击打开链接，单击只放光标", async ({ page, context }) => {
    await context.route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));
    await load(page, "see [x](https://example.com/page) now", 0);
    const point = await pointAt(page, "x", 0);
    await page.mouse.click(point.x + 2, point.y);
    expect(context.pages()).toHaveLength(1);
    const popup = page.waitForEvent("popup");
    await page.keyboard.down("Control");
    await page.mouse.click(point.x + 2, point.y);
    await page.keyboard.up("Control");
    expect((await popup).url()).toBe("https://example.com/page");
    // 只打开一次（浏览器自己不再打开）
    await page.waitForTimeout(300);
    expect(context.pages()).toHaveLength(2);
  });
});

test.describe("gapcursor", () => {
  test("表格前面能放光标并输入", async ({ page }) => {
    await load(page, "| a |\n| --- |\n| b |", 2);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.type("x");
    expect((await read(page)).value).toBe("x\n\n| a |\n| --- |\n| b |");
  });
});

test.describe("拖放", () => {
  test("拖动选中的文字移到别处", async ({ page }) => {
    await load(page, "alpha beta gamma", 0);
    const word = await pointAt(page, "beta", 1);
    await page.mouse.dblclick(word.x, word.y);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("beta");
    // 等过了双击的间隔，不然接着按下算三击（选中整段）
    await page.waitForTimeout(700);
    const start = await pointAt(page, "beta", 2);
    const target = await pointAt(page, "gamma", 5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 1, target.y, { steps: 10 });
    await page.mouse.up();
    expect((await read(page)).value).toBe("alpha  gammabeta");
  });
});

test.describe("C-1 复制粘贴", () => {
  test("在编辑器里复制、粘贴：Markdown 原样过去，切开的片段补全标记", async ({ page }) => {
    // 选中粗体里的 ol（源码偏移 5～7）
    await load(page, "a **bold** b\n\nend");
    await page.evaluate(() => {
      window.markoTest.setMarkdown("a **bold** b\n\nend", { anchor: 5, head: 7 });
      window.markoTest.editor.view.focus();
    });
    await page.keyboard.press("Control+c");
    await page.evaluate(() => window.markoTest.editor.commands.focus("end"));
    await page.keyboard.press("Control+v");
    expect((await read(page)).value).toBe("a **bold** b\n\nend**ol**");
  });
});

test.describe("I-5 Emoji 补全", () => {
  test("输入 : 加字母弹出候选，回车写成 :shortcode:", async ({ page }) => {
    await load(page, "hi", 2);
    await page.keyboard.type(" :smi");
    const list = page.locator(".md-emoji-suggestions");
    await expect(list).toBeVisible();
    await expect(list.locator(".md-emoji-option-selected .md-emoji-name")).toHaveText(":smile:");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(list).toHaveCount(0);
    expect((await read(page)).value).toBe("hi :smile:");
  });

  test("代码里不弹；Esc 关闭", async ({ page }) => {
    await load(page, "`code `", 6);
    await page.keyboard.type(":smi");
    await expect(page.locator(".md-emoji-suggestions")).toHaveCount(0);
    await load(page, "x", 1);
    await page.keyboard.type(" :ta");
    await expect(page.locator(".md-emoji-suggestions")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".md-emoji-suggestions")).toHaveCount(0);
    expect((await read(page)).value).toBe("x :ta");
  });
});

test.describe("E-11 源码模式", () => {
  test("Ctrl+/ 切换；源码里改的马上到文档上；撤销跨模式连续；选区按源码偏移换回去", async ({ page }) => {
    await load(page, "# Title\n\nsome **text**", "# Title\n\nsome".length);
    await page.keyboard.press("Control+/");
    const source = page.locator(".md-source-mode .cm-content");
    await expect(source).toBeVisible();
    await expect(page.locator("#write")).toBeHidden();
    await expect(source).toContainText("some **text**");
    await page.keyboard.type(" more");
    expect((await read(page)).value).toBe("# Title\n\nsome more **text**");
    // 大纲等照常：文档已经是新的
    expect(await page.evaluate(() => window.markoTest.editor.state.doc.child(1).textContent)).toBe("some more **text**");
    await page.keyboard.press("Control+z");
    await expect(source).toContainText("some **text**");
    await page.keyboard.type("!");
    await page.keyboard.press("Control+/");
    await expect(page.locator(".md-source-mode")).toHaveCount(0);
    await expect(page.locator("#write")).toBeVisible();
    const snapshot = await read(page);
    expect(snapshot.value).toBe("# Title\n\nsome! **text**");
    expect(snapshot.anchor).toBe("# Title\n\nsome!".length);
    // 回到排版视图后还能撤销源码模式里的输入
    await page.keyboard.press("Control+z");
    expect((await read(page)).value).toBe("# Title\n\nsome **text**");
  });

  test("源码模式下的查找替换用 CodeMirror 的", async ({ page }) => {
    await load(page, "a **b** a", 0);
    await page.keyboard.press("Control+/");
    const status = await page.evaluate(() => {
      const { editor } = window.markoTest;
      editor.commands.setFind({ search: "**" });
      editor.commands.findNext();
      return window.markoTest.findStatus();
    });
    expect(status).toEqual({ current: 1, total: 2, invalid: false });
    await page.evaluate(() => {
      const { editor } = window.markoTest;
      editor.commands.setFind({ search: "a", replace: "c" });
      editor.commands.replaceAll();
    });
    expect((await read(page)).value).toBe("c **b** c");
  });
});

test.describe("V-1、V-2 专注模式、打字机模式", () => {
  test("F8：光标所在的块以外变淡", async ({ page }) => {
    await load(page, "first\n\nsecond\n\n- a\n- b", 0);
    await page.keyboard.press("F8");
    await expect(page.locator("#write")).toHaveClass(/on-focus-mode/);
    const opacity = (selector: string) => page.locator(selector).first().evaluate((element) => Number(getComputedStyle(element).opacity));
    expect(await opacity("#write > p:nth-of-type(1)")).toBe(1);
    await expect.poll(() => opacity("#write > p:nth-of-type(2)")).toBeLessThan(0.5);
    await page.keyboard.press("F8");
    await expect(page.locator("#write")).not.toHaveClass(/on-focus-mode/);
  });

  test("F9：输入时光标所在的行滚到窗口中间", async ({ page }) => {
    const lines = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n\n");
    await load(page, lines, lines.indexOf("line 60"));
    await page.keyboard.press("F9");
    await page.keyboard.type("x");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const { view } = window.markoTest.editor;
          const coords = view.coordsAtPos(view.state.selection.head);
          return Math.abs((coords.top + coords.bottom) / 2 - window.innerHeight / 2);
        }),
      )
      .toBeLessThan(40);
  });
});

test.describe("M-2 插入图片", () => {
  test("粘贴剪贴板里的图片：先放占位，宿主保存后写进地址", async ({ page }) => {
    await load(page, "see ", 4);
    await page.evaluate(() => {
      const data = new DataTransfer();
      const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));
      data.items.add(new File([bytes], "dot.png", { type: "image/png" }));
      window.markoTest.editor.view.dom.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect.poll(async () => (await read(page)).value).toMatch(/^see !\[dot\]\(data:image\/png;base64,/);
    await expect(page.locator("#write .md-image-placeholder")).toHaveCount(0);
  });
});

test.describe("N-4 文档内链接", () => {
  test("Ctrl+Shift+O：#标题 跳到本文档的这个标题", async ({ page }) => {
    await load(page, "[go](#第二节)\n\n# 第一节\n\n# 第二节\n\ntext", 2);
    await page.keyboard.press("Control+Shift+O");
    const snapshot = await read(page);
    expect(snapshot.value.slice(snapshot.anchor)).toBe("第二节\n\ntext");
  });
});

test.describe("E-5 Tab", () => {
  test("列表项 Tab 缩进一层、Shift+Tab 反缩进；代码块里 Tab 插入制表符", async ({ page }) => {
    await load(page, "- one\n- two\n\n```\ncode\n```", "- one\n- tw".length);
    await page.keyboard.press("Tab");
    expect((await read(page)).value).toBe("- one\n  - two\n\n```\ncode\n```");
    await page.keyboard.press("Shift+Tab");
    expect((await read(page)).value).toBe("- one\n- two\n\n```\ncode\n```");
    await page.evaluate(() => window.markoTest.setMarkdown("- one\n- two\n\n```\ncode\n```", { anchor: "- one\n- two\n\n```\nco".length, head: "- one\n- two\n\n```\nco".length }));
    await expect(page.locator("#write .cm-editor.cm-focused")).toHaveCount(1);
    await page.keyboard.press("Tab");
    expect((await read(page)).value).toBe("- one\n- two\n\n```\nco\tde\n```");
  });
});

test.describe("B-11 脚注", () => {
  test("单击上标跳到定义；定义的回链跳回引用处", async ({ page }) => {
    await load(page, "see[^n] here\n\npara\n\n[^n]: the note", "see[^n] here\n\npara".length);
    await page.locator("#write sup.md-footnote").click();
    let snapshot = await read(page);
    expect(snapshot.value.slice(snapshot.anchor)).toBe("the note");
    await page.locator("#write .md-def-backlink").click();
    snapshot = await read(page);
    expect(snapshot.anchor).toBe(3);
  });
});

test.describe("B-6 缩进代码块", () => {
  test("在最后一行末尾回车再输入：新的一行还在代码块里", async ({ page }) => {
    await load(page, "    code\n\nafter", "    code".length);
    await expect(page.locator("#write .cm-editor.cm-focused")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await page.keyboard.type("x");
    expect((await read(page)).value).toBe("    code\n    x\n\nafter");
  });
});
