import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { parse } from "@vue/compiler-sfc";
import { getEffectiveCssRule } from "./helpers/cssRules";

interface VerticalMarginFixture {
  name: string;
  selector: string;
}

interface VerticalMargins {
  top: string;
  bottom: string;
}

const componentPath = resolve("src/components/ContinuousMarkdownEditor.vue");
const descriptor = parse(readFileSync(componentPath, "utf8"), { filename: componentPath }).descriptor;
const scopedStyle = descriptor.styles
  .filter((style) => style.scoped)
  .map((style) => style.content)
  .join("\n");

const fixtures: VerticalMarginFixture[] = [
  {
    name: "代码块 preview 的 pre",
    selector: ":deep(.cm-special-preview pre)",
  },
  {
    name: "脚注定义 Widget",
    selector: ":deep(.cm-footnote-definition-widget)",
  },
  {
    name: "活动数学公式 preview",
    selector: ":deep(.cm-active-math-preview)",
  },
];

const formattingContextFixtures: VerticalMarginFixture[] = [
  {
    name: "HTML Widget",
    selector: ":deep(.cm-special-preview-html)",
  },
  {
    name: "定义列表 Widget",
    selector: ":deep(.cm-special-preview-definition)",
  },
];

test("连续编辑器块级 Widget 不使用外部垂直 margin 提供布局间距", () => {
  const violations = fixtures.flatMap(({ name, selector }) => {
    const margins = readVerticalMargins(getEffectiveCssRule(scopedStyle, selector));
    return [
      ["margin-top", margins.top],
      ["margin-bottom", margins.bottom],
    ].flatMap(([property, value]) => (
      isZeroMargin(value!) ? [] : [`${name}: ${property}=${value}`]
    ));
  });

  assert.deepEqual(
    violations,
    [],
    "块级 Widget 的垂直间距必须放在根节点 padding 或内部布局中，避免 CodeMirror 坐标映射遗漏外部 margin",
  );
});

test("HTML 与定义列表 Widget 根节点建立独立格式化上下文", () => {
  const violations = formattingContextFixtures.flatMap(({ name, selector }) => {
    const declarations = getEffectiveCssRule(scopedStyle, selector);
    return /(?:^|\s)display:\s*flow-root(?:\s*!important)?;/.test(declarations)
      ? []
      : [`${name}: display 不是 flow-root`];
  });

  assert.deepEqual(
    violations,
    [],
    "HTML 与定义列表 Widget 必须使用 flow-root，避免子元素的垂直 margin 穿透根节点",
  );
});

function readVerticalMargins(declarations: string): VerticalMargins {
  const root = postcss.parse(`.fixture { ${declarations} }`);
  const rule = root.first;
  assert.equal(rule?.type, "rule");

  const margins: VerticalMargins = { top: "0", bottom: "0" };
  for (const node of rule.nodes) {
    if (node.type !== "decl") continue;
    const values = postcss.list.space(node.value);
    if (node.prop === "margin") {
      margins.top = values[0] ?? "0";
      margins.bottom = values.length < 3 ? margins.top : values[2] ?? "0";
    } else if (node.prop === "margin-block") {
      margins.top = values[0] ?? "0";
      margins.bottom = values[1] ?? margins.top;
    } else if (node.prop === "margin-top" || node.prop === "margin-block-start") {
      margins.top = node.value;
    } else if (node.prop === "margin-bottom" || node.prop === "margin-block-end") {
      margins.bottom = node.value;
    }
  }
  return margins;
}

function isZeroMargin(value: string): boolean {
  return /^[+-]?0(?:[a-z]+|%)?$/i.test(value.trim());
}
