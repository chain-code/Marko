// X-1：不可信文档。恶意 HTML、恶意图表输出的样本固定在这里（1.10 节）
import { parse } from "@marko/markdown";
import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/html.ts";
import { sanitizeHtml, sanitizeSvg } from "../src/sanitize.ts";

const html = (source: string) => renderHtml(parse(source));

/** 渲染结果里不能出现的东西 */
function expectHarmless(output: string): void {
  expect(output).not.toMatch(/<script/i);
  expect(output).not.toMatch(/\son[a-z]+\s*=/i);
  // 地址属性里不能有 javascript:（作为文字显示出来没关系）
  expect(output).not.toMatch(/(?:href|src|action|data|xlink:href)\s*=\s*["']?\s*javascript:/i);
  expect(output).not.toMatch(/<(?:object|embed|form|input(?![^>]*type="checkbox")|button|textarea|select|base|meta|link|style)\b/i);
  expect(output).not.toMatch(/srcdoc/i);
}

describe("X-1 文档里的 HTML", () => {
  const samples = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<iframe src="http://evil.example/"></iframe>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<object data="evil.swf"></object>',
    '<embed src="evil.swf">',
    '<form action="https://evil.example/"><input name="p"><button>go</button></form>',
    "<svg><script>alert(1)</script></svg>",
    "<svg onload=alert(1)></svg>",
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    "<style>body{display:none}</style>",
    '<base href="https://evil.example/">',
    '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
    '<link rel="stylesheet" href="https://evil.example/x.css">',
    '<video src="a.mp4" onplay="alert(1)"></video>',
    '<div onclick="alert(1)">click</div>',
    '<img src="data:image/svg+xml;base64,PHN2Zy8+">',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    "<textarea><script>alert(1)</script></textarea>",
    "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>",
  ];

  it.each(samples.map((sample) => [sample]))("HTML 块：%s", (sample) => {
    expectHarmless(html(sample));
  });

  it.each(samples.map((sample) => [sample]))("行内 HTML：%s", (sample) => {
    expectHarmless(html(`before ${sample} after`));
  });

  it("Markdown 写法的 javascript: 地址也不给", () => {
    expectHarmless(html("[x](javascript:alert(1)) ![y](javascript:alert(1)) <javascript:alert(1)> [r]\n\n[r]: javascript:alert(1)"));
  });

  it("常用的标签照常保留", () => {
    const output = html('<details><summary>S</summary>body</details>\n\n<video src="a.mp4" controls></video>\n\nText <kbd>Ctrl</kbd> <mark>m</mark> <u>u</u> <span style="color:red">red</span>');
    expect(output).toContain("<details><summary>S</summary>body</details>");
    expect(output).toContain('<video src="a.mp4" controls=""></video>');
    expect(output).toContain("<kbd>Ctrl</kbd>");
    expect(output).toContain('<span style="color:red">red</span>');
  });

  it("https 的 iframe 保留，加上沙箱", () => {
    const output = sanitizeHtml('<iframe src="https://www.youtube.com/embed/x" onload="alert(1)"></iframe>');
    expect(output).toMatch(/^<iframe src="https:\/\/www\.youtube\.com\/embed\/x" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="no-referrer"><\/iframe>$/);
  });

  it("样式里跳出编辑区的定位（fixed、absolute、sticky）去掉，别的样式照留（审查 #13：不能盖住整个界面）", () => {
    expect(sanitizeHtml('<span style="position:fixed;inset:0;z-index:99999;color:red">x</span>')).toBe('<span style="inset: 0px; z-index: 99999; color: red;">x</span>');
    expect(sanitizeHtml('<div style="position: absolute">x</div>')).toBe("<div>x</div>");
    expect(sanitizeHtml('<span style="position:sticky;top:0">x</span>')).toBe('<span style="top: 0px;">x</span>');
    expect(sanitizeHtml('<span style="position: relative; color: blue">x</span>')).toBe('<span style="position: relative; color: blue">x</span>');
  });

  it("图片的 data: 地址只给常见位图", () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zy8+">')).not.toContain("src=");
  });

  it("本地资源地址 marko-asset: 和相对路径照常", () => {
    expect(sanitizeHtml('<img src="marko-asset://local/C%3A/a.png"> <a href="./doc.md#title">d</a>')).toBe('<img src="marko-asset://local/C%3A/a.png"> <a href="./doc.md#title">d</a>');
  });
});

describe("X-1 图表沙箱返回的 SVG", () => {
  it("去掉脚本、事件、javascript: 链接，保留图形和 foreignObject 里的文字", () => {
    const output = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><rect width="10" height="10"></rect></a><foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">label</div></foreignObject></svg>',
    );
    expectHarmless(output);
    expect(output).toContain("<rect");
    expect(output).toContain("label");
  });

  it("Raphael 的箭头：marker 里的 <use> 保留，但只能引用图里的 #id", () => {
    const output = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="raphael-marker-block" d="M5,0 0,2.5 5,5z"></path><marker id="m1"><use xlink:href="#raphael-marker-block"></use></marker></defs><path d="M0,0L10,10" marker-end="url(#m1)"></path><use href="https://example.com/sprite.svg#x"></use><use xlink:href="data:image/svg+xml,%3Csvg%3E"></use></svg>',
    );
    expect(output).toContain('<use xlink:href="#raphael-marker-block"></use>');
    expect(output).toContain('marker-end="url(#m1)"');
    expect(output).not.toContain("example.com");
    expect(output).not.toContain("data:");
  });

  describe("Mermaid 的 <style>：只留作用范围限定在这张图里的", () => {
    const id = "marko-mermaid-0a1b2c3d-1";
    const styleOf = (svgId: string, css: string) => {
      const output = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" id="${svgId}"><style>${css}</style><g class="node"><rect></rect></g></svg>`);
      return /<style>([\s\S]*?)<\/style>/.exec(output)?.[1] ?? null;
    };
    // 照 Mermaid 11 实际生成的样式的写法：每条规则都带 #id，@keyframes 套一层，字体名带引号
    const mermaidLike = `#${id}{font-family:"trebuchet ms",verdana,arial,sans-serif;fill:#333;}@keyframes dash{to{stroke-dashoffset:0;}}#${id} .node rect,#${id} .node polygon{fill:#ECECFF;stroke:url(#${id}-gradient);}#${id} .label:not(.x){color:#333;}`;

    it("Mermaid 生成的样式保留；动画名是全局的，加上图的 id 当前缀（@keyframes 和 animation 里的引用一起改）", () => {
      expect(styleOf(id, mermaidLike)).toBe(mermaidLike.replace("@keyframes dash", `@keyframes ${id}-dash`));
      const animated = `#${id} .edge{animation:dash 50s linear infinite;}#${id} .other{animation-name:dash,edge-animation-frame;}@keyframes dash{to{x:0;}}@keyframes edge-animation-frame{from{x:0;}}`;
      expect(styleOf(id, animated)).toBe(
        `#${id} .edge{animation:${id}-dash 50s linear infinite;}#${id} .other{animation-name:${id}-dash,${id}-edge-animation-frame;}@keyframes ${id}-dash{to{x:0;}}@keyframes ${id}-edge-animation-frame{from{x:0;}}`,
      );
    });

    it("<style> 里夹着子元素时整个清空（CSS 只认直接的文字子节点，和 textContent 不一致）", () => {
      const output = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" id="${id}"><style><g>#${id} x</g>body{display:none}</style></svg>`);
      expect(output).not.toContain("display:none");
    });

    it.each([
      ["id 不是沙箱起的（可能盖住正文的 #write）", "write", "#write{display:none;}"],
      ["规则不带这张图的 id", id, `body{display:none;}#${id}{fill:#333;}`],
      ["选择器列表里混进别的", id, `#${id} .a,body{display:none;}`],
      ["id 只是前缀相同", id, `#${id}2{fill:red;}`],
      ["兄弟选择器跳到图外面", id, `#${id} ~ p{display:none;}`],
      ["相邻选择器跳到图外面", id, `#${id}+p{display:none;}`],
      ["CSS 嵌套", id, `#${id}{& ~ p{display:none;}}`],
      ["@import 引进别的样式", id, `@import url(https://example.com/a.css);#${id}{fill:#333;}`],
      ["@media 里的规则不受限", id, `@media screen{body{display:none;}}`],
      ["@font-face", id, `@font-face{font-family:x;src:url(https://example.com/f.woff);}`],
      ["反斜杠转义", id, `#${id}\\,body{display:none;}`],
      ["注释", id, `#${id}/**/,body{display:none;}`],
      ["字符串没闭合", id, `#${id}{content:"}body{display:none;}`],
      // 下面三个是审查时在 Chromium 里验证过能藏起 body 的写法：CSS 的分词和简单的字符串匹配不一致
      ["没加引号的 url( 里有引号（CSS 里是坏的 url，不是字符串）", id, `#${id} a{b:url(x"y)}body{display:none}c{d:";}`],
      ["换页符在 CSS 里结束字符串", id, `#${id}{x:"a${String.fromCharCode(12)}}body{display:none}#${id}{y:"}`],
      ["回车符在 CSS 里结束字符串", id, `#${id}{x:"a${String.fromCharCode(13)}}body{display:none}#${id}{y:"}`],
      ["@keyframes 里的 url( 加引号", id, "@keyframes x{to{a:url(x'y)}}body{display:none}c{d:';}}"],
      ["url() 指向外面", id, `#${id}{background:url(https://example.com/track.png);}`],
      ["加引号的 url() 指向外面", id, `#${id}{background:url("https://example.com/track.png");}`],
      ["image-set() 用字符串加载外部图片", id, `#${id}{background:image-set("https://example.com/a.png" 1x);}`],
      ["不在白名单里的函数", id, `#${id}{width:attr(data-x);}`],
      ["#id 后面紧跟非 ASCII 的名字字符（是另一个 id）", id, `#${id}中{fill:red;}`],
    ])("清空：%s", (_name, svgId, css) => {
      expect(styleOf(svgId, css)).toBe("");
    });

    it("字符串里的括号不影响判断", () => {
      const css = `#${id} .label{font-family:"a}b{c";}`;
      expect(styleOf(id, css)).toBe(css);
    });

    it("文档里的 HTML 照样不许有 <style>", () => {
      expect(sanitizeHtml(`<svg id="${id}"><style>${mermaidLike}</style></svg>`)).not.toContain("<style");
    });
  });
});

describe("1.10 节 文档里嵌的 iframe 的 allow", () => {
  const allowOf = (allow: string) => {
    const container = document.createElement("div");
    container.innerHTML = sanitizeHtml(`<iframe src="https://example.com/v" allow="${allow}"></iframe>`);
    return container.querySelector("iframe")?.getAttribute("allow") ?? null;
  };

  it("只留视频要用的几样；摄像头、麦克风、定位、剪贴板读取之类去掉，来源列表也去掉", () => {
    expect(allowOf("camera *; microphone *; geolocation *; clipboard-read *")).toBeNull();
    expect(allowOf("accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share")).toBe("autoplay; encrypted-media; picture-in-picture");
    expect(allowOf("fullscreen *; FULLSCREEN")).toBe("fullscreen");
  });
});
