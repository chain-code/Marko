// O-1：导出、打印的 CSS 里，内置主题的字体是应用自己的地址（app://marko/assets/…，开发时是开发服务器的地址），
// 导出的文件拿到应用外面打开就取不到、换成了备用字体。导出前把这些换成 data URI（用户主题的字体由主进程转过，A-3）
const FONT_URL = /url\(\s*(["']?)([^"')]+?\.(?:woff2|woff|ttf|otf)(?:[?#][^"')]*)?)\1\s*\)/gi;
const MIME: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** 协议加主机（自定义协议的 URL 在有的环境里 origin 是 "null"，不能直接比） */
function siteOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

/** 把 css 里和 base 同一个来源的字体换成 data URI；别的地址（data:、网上的字体）不动，取不到的留原样 */
export async function inlineFonts(css: string, base: string, fetcher: (url: string) => Promise<Response> = (url) => fetch(url)): Promise<string> {
  const site = siteOf(new URL(base));
  const targets = new Map<string, string>();
  for (const match of css.matchAll(FONT_URL)) {
    const raw = match[2]!;
    if (targets.has(raw)) continue;
    try {
      const url = new URL(raw, base);
      if (siteOf(url) === site) targets.set(raw, url.href);
    } catch {
      // 不是地址：不管
    }
  }
  const inlined = new Map<string, string>();
  await Promise.all(
    [...targets].map(async ([raw, href]) => {
      try {
        const response = await fetcher(href);
        if (!response.ok) return;
        const extension = /\.(\w+)$/.exec(new URL(href).pathname)?.[1]?.toLowerCase() ?? "";
        inlined.set(raw, `data:${MIME[extension] ?? "application/octet-stream"};base64,${toBase64(new Uint8Array(await response.arrayBuffer()))}`);
      } catch {
        // 取不到：留原样
      }
    }),
  );
  return css.replace(FONT_URL, (whole, _quote: string, raw: string) => {
    const data = inlined.get(raw);
    return data ? `url("${data}")` : whole;
  });
}
