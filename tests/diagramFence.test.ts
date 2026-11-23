import assert from "node:assert/strict";
import test from "node:test";
import { replaceDiagramFenceSource } from "../src/utils/diagramFence";

test("replaceDiagramFenceSource 保留普通图表围栏和周围正文", () => {
  const source = "before\n```mermaid\nflowchart LR\nA --> B\n```\nafter";
  assert.equal(
    replaceDiagramFenceSource(source, "sequenceDiagram\nA->>B: Hello"),
    "before\n```mermaid\nsequenceDiagram\nA->>B: Hello\n```\nafter",
  );
});

test("replaceDiagramFenceSource 保留引用和嵌套引用前缀", () => {
  assert.equal(
    replaceDiagramFenceSource("> ```mermaid\n> flowchart LR\n> A --> B\n> ```", "flowchart TD\nA --> C"),
    "> ```mermaid\n> flowchart TD\n> A --> C\n> ```",
  );
  assert.equal(
    replaceDiagramFenceSource("> > ~~~mmd\n> > graph LR\n> > A --> B\n> > ~~~", "graph TD\nB --> C"),
    "> > ~~~mmd\n> > graph TD\n> > B --> C\n> > ~~~",
  );
});

test("replaceDiagramFenceSource 保留列表缩进、长围栏和 CRLF", () => {
  const source = "- 图表\r\n  ````flowchart title\r\n  st=>start: Start\r\n  st->e\r\n  ````\r\n- 后续";
  assert.equal(
    replaceDiagramFenceSource(source, "st=>start: New\ne=>end: End\nst->e\n"),
    "- 图表\r\n  ````flowchart title\r\n  st=>start: New\r\n  e=>end: End\r\n  st->e\r\n  ````\r\n- 后续",
  );
});

test("replaceDiagramFenceSource 不修改非图表或未闭合围栏", () => {
  const code = "```js\nconst value = 1\n```";
  const open = "```mermaid\nflowchart LR";
  assert.equal(replaceDiagramFenceSource(code, "flowchart TD"), code);
  assert.equal(replaceDiagramFenceSource(open, "flowchart TD"), open);
});
