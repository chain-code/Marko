import assert from "node:assert/strict";
import test from "node:test";
import { getContinuousMarkdownLinePresentations } from "../src/utils/continuousEditor";

const fence = String.fromCharCode(96).repeat(3);

test("代码围栏后接空行和正文时仍折叠开闭围栏", () => {
  for (const lineBreak of ["\n", "\r\n"]) {
    const source = [fence + "ts", "alpha", fence, "", "After"].join(lineBreak);
    const cursor = source.indexOf("alpha");
    const lines = getContinuousMarkdownLinePresentations(source, cursor);

    expectClass(lines[0]?.className, "cm-active-raw-fence-hidden");
    expectClass(lines[1]?.className, "cm-active-raw-content-first");
    expectClass(lines[1]?.className, "cm-active-raw-content-last");
    expectClass(lines[2]?.className, "cm-active-raw-fence-hidden");
    assert.doesNotMatch(lines[3]?.className ?? "", /cm-raw-block/);
  }
});

function expectClass(className: string | undefined, expected: string) {
  assert.match(className ?? "", new RegExp(`(?:^|\\s)${expected}(?:\\s|$)`));
}
