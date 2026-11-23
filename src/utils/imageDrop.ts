export interface DroppedImageSource {
  source: string;
  alt: string;
}

export interface DroppedImageTextPayload {
  html?: string;
  uriList?: string;
  text?: string;
}

const imagePathPattern = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:$|[?#])/i;

export function getDroppedImageSource(payload: DroppedImageTextPayload): DroppedImageSource | null {
  const htmlImage = getHtmlImage(payload.html ?? "");
  if (htmlImage) return htmlImage;

  const uri = firstUriListValue(payload.uriList ?? "");
  if (uri && isLikelyImageSource(uri, true)) {
    return { source: uri, alt: getImageAltFromSource(uri) };
  }

  const text = (payload.text ?? "").trim();
  return text && isLikelyImageSource(text, true)
    ? { source: text, alt: getImageAltFromSource(text) }
    : null;
}

function getHtmlImage(html: string): DroppedImageSource | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const image = new DOMParser().parseFromString(html, "text/html").querySelector("img[src]");
  const source = image?.getAttribute("src")?.trim() ?? "";
  if (!source || !isLikelyImageSource(source, false)) return null;
  const alt = image?.getAttribute("alt")?.trim() || getImageAltFromSource(source);
  return { source, alt };
}

function firstUriListValue(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) ?? "";
}

function isLikelyImageSource(source: string, requireImageHint: boolean): boolean {
  if (/^data:/i.test(source)) return /^data:image\//i.test(source);
  if (/^(?:javascript|vbscript):/i.test(source)) return false;
  if (/^blob:/i.test(source)) return true;
  if (!requireImageHint) return true;
  return imagePathPattern.test(source);
}

function getImageAltFromSource(source: string): string {
  const withoutMetadata = source.split(/[?#]/, 1)[0] ?? "";
  const name = withoutMetadata.replace(/\\/g, "/").split("/").at(-1) ?? "";
  if (!name || /^data:|^blob:/i.test(source)) return "图片";
  try {
    return decodeURIComponent(name).replace(/\.[^.]+$/, "") || "图片";
  } catch {
    return name.replace(/\.[^.]+$/, "") || "图片";
  }
}
