// O-1 导出 HTML：自包含，公式、图表预先渲染，不引用外网脚本
import { parse } from "@marko/markdown";
import { describe, expect, it } from "vitest";
import { exportDocument } from "../src/exportDocument.ts";

const source = ["# Title", "", "Inline $x$.", "", "```js", "let a = 1;", "```", "", "```mermaid", "graph TD", "```", "", "```sequence", "A->B: bad", "```"].join("\n");

describe("O-1 导出 HTML", () => {
  it("内嵌主题 CSS，正文放在 #write 里，带只允许样式和图片的 CSP，没有脚本", async () => {
    const html = await exportDocument(parse(source), { title: "My <Doc>", css: "#write { color: red; } </style><script>", renderDiagram: async () => ({ svg: "<svg></svg>" }) });
    expect(html.startsWith("<!doctype html>\n<html lang=\"zh-CN\">")).toBe(true);
    expect(html).toContain("<title>My &lt;Doc&gt;</title>");
    expect(html).toContain("<style>\n#write { color: red; } <\\/style><script>\n");
    // 有公式时带上 MathJax 的样式
    expect(html).toContain('mjx-container[jax="SVG"]');
    expect(html).toContain(`content="default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline'; font-src * data:; frame-src https:"`);
    expect(html).toContain('<div id="write"><h1 id="title">Title</h1>');
    expect(html).not.toMatch(/<script(?![^<]*\n<\/style>)/);
  });

  it("代码按语言高亮（导出前把语言加载好）；公式是 SVG", async () => {
    const html = await exportDocument(parse(source), { title: "t" });
    expect(html).toContain('<span class="cm-keyword">let</span>');
    expect(html).toContain('<mjx-container class="MathJax" jax="SVG"');
  });

  it("图表预先渲染成 SVG；渲染失败的显示源码和错误（D-6）；没给渲染器时按代码块", async () => {
    const html = await exportDocument(parse(source), {
      title: "t",
      theme: "dark",
      renderDiagram: async (kind, _source, theme) => (kind === "mermaid" ? { svg: `<svg class="${theme}"></svg>` } : { error: "Parse error" }),
    });
    expect(html).toContain('<html lang="zh-CN" class="dark">');
    expect(html).toContain('<div class="md-diagram-panel" lang="mermaid"><div class="md-diagram-panel-preview"><svg class="dark"></svg></div></div>');
    expect(html).toContain('<div class="md-diagram-panel md-diagram-error" lang="sequence"><pre>A-&gt;B: bad</pre><p class="md-diagram-error-message">Parse error</p></div>');
    const plain = await exportDocument(parse(source), { title: "t" });
    expect(plain).toContain('data-diagram="mermaid"');
  });

  it("X-1 恶意文档导出后：没有脚本、事件属性、javascript: 地址，iframe 都带 sandbox、allow 里没有危险能力", async () => {
    const open = String.fromCharCode(0xe000);
    const close = String.fromCharCode(0xe001);
    const evil = [
      "$x$ 和 $y$",
      "",
      `<iframe src="https://evil.example/${open}0${close}" allow="camera *; microphone *; fullscreen"></iframe>`,
      "",
      '<img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">l</a> <svg><script>alert(1)</script></svg>',
      "",
      `[l](https://a.example/${open}1${close}) &#xE000;0&#xE001; <b onclick="alert(1)">b</b>`,
      "",
      "```mermaid",
      "graph TD",
      "```",
    ].join("\n");
    const html = await exportDocument(parse(evil), {
      title: "t",
      renderDiagram: async () => ({ svg: '<svg onload="alert(1)"><script>alert(1)</script><g></g></svg>' }),
    });
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("script")).toHaveLength(0);
    for (const element of document.querySelectorAll("*")) {
      for (const { name, value } of element.attributes) {
        expect(name.startsWith("on"), `${element.tagName} ${name}`).toBe(false);
        expect(/^\s*javascript:/i.test(value), `${element.tagName} ${name}`).toBe(false);
      }
    }
    const frames = [...document.querySelectorAll("iframe")];
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-presentation");
    expect(frames[0].getAttribute("allow")).toBe("fullscreen");
    // 两个行内公式各渲染一次，占位字符没被冒充
    expect(document.querySelectorAll("mjx-container")).toHaveLength(2);
  });

  it("「HTML（不含样式）」不带主题 CSS", async () => {
    const html = await exportDocument(parse("text"), { title: "t", css: "p{}", noStyle: true });
    expect(html).not.toContain("<style>");
  });
});
