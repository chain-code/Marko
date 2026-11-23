import {
  collectInlineHtmlMarkupRanges,
  collectInlineMarkdownSyntax,
  type InlineMarkdownSyntax,
} from "./inlineSyntax";
import {
  readMarkdownReferenceLink,
  readMarkdownShortcutReferenceLink,
} from "./markdownLinks";
import {
  collectReferenceDefinitionSemantics,
  normalizeMarkdownReferenceLabel,
} from "./referenceDefinitionSemantics";

export type RenderedImageState = "loading" | "loaded" | "error";

interface RenderedImageSource {
  raw: string;
  start: number;
  end: number;
  alt: string;
}

export function prepareRenderedImages(
  root: ParentNode,
  source: string,
  onStateChange?: (image: HTMLImageElement, state: RenderedImageState) => void,
  documentSource = source,
) {
  annotateRenderedImageSources(root, source, documentSource);
  collectRenderedImageElements(root).forEach((image) => {
    const raw = image.dataset.markoImageSource || image.outerHTML;
    bindRenderedImageState(image, raw, onStateChange);
  });
}

function collectRenderedImageElements(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img"))
    .filter((image) => !isCodeMirrorWidgetBuffer(image));
}

function isCodeMirrorWidgetBuffer(image: HTMLImageElement): boolean {
  return image.classList.contains("cm-widgetBuffer")
    && image.getAttribute("aria-hidden") === "true"
    && !image.hasAttribute("src")
    && image.closest(".cm-editor") !== null;
}

export function bindRenderedImageState(
  image: HTMLImageElement,
  source: string,
  onStateChange?: (image: HTMLImageElement, state: RenderedImageState) => void,
) {
  image.dataset.markoImageSource = source;

  const update = (state: RenderedImageState) => {
    image.dataset.markoImageState = state;
    image.classList.toggle("marko-image-error", state === "error");
    image.hidden = state === "error";
    if (state === "error") {
      const fallback = ensureImageErrorFallback(image);
      fallback.textContent = image.dataset.markoImageSource || source;
      image.setAttribute("aria-invalid", "true");
    } else {
      const fallback = image.previousElementSibling;
      if (fallback instanceof HTMLElement && fallback.classList.contains("marko-image-error-source")) {
        fallback.remove();
      }
      image.removeAttribute("aria-invalid");
    }
    onStateChange?.(image, state);
  };
  if (image.dataset.markoImageStateBound !== "true") {
    image.dataset.markoImageStateBound = "true";
    image.addEventListener("load", () => update("loaded"));
    image.addEventListener("error", () => update("error"));
  }

  if (image.complete) update(image.naturalWidth > 0 ? "loaded" : "error");
  else update("loading");
}

function ensureImageErrorFallback(image: HTMLImageElement): HTMLElement {
  const previous = image.previousElementSibling;
  if (previous instanceof HTMLElement && previous.classList.contains("marko-image-error-source")) {
    return previous;
  }
  const fallback = document.createElement("span");
  fallback.className = "marko-image-error-source";
  fallback.setAttribute("contenteditable", "false");
  fallback.setAttribute("role", "status");
  fallback.setAttribute("aria-label", "\u56fe\u7247\u52a0\u8f7d\u5931\u8d25");
  fallback.setAttribute("title", "\u56fe\u7247\u52a0\u8f7d\u5931\u8d25");
  image.before(fallback);
  return fallback;
}

export function getImageFromErrorFallback(target: Element | null): HTMLImageElement | null {
  const fallback = target?.closest<HTMLElement>(".marko-image-error-source");
  return fallback?.nextElementSibling instanceof HTMLImageElement
    ? fallback.nextElementSibling
    : null;
}

export function isMissingReferenceImageSource(source: string): boolean {
  const trimmed = source.trim();
  return /^!\[(?:\\.|[^\]])*\]\[(?:\\.|[^\]])*\]$/.test(trimmed)
    || /^!\[(?:\\.|[^\]])*\]$/.test(trimmed);
}

function annotateRenderedImageSources(
  root: ParentNode,
  source: string,
  documentSource: string,
) {
  const candidates = collectRenderedImageSources(source, documentSource);
  const images = collectRenderedImageElements(root);
  let candidateIndex = 0;

  for (const image of images) {
    let match = -1;
    for (let index = candidateIndex; index < candidates.length; index += 1) {
      if (normalizeAlt(candidates[index].alt) === normalizeAlt(image.alt)) {
        match = index;
        break;
      }
    }
    if (match < 0) continue;
    const candidate = candidates[match];
    image.dataset.markoImageSource = candidate.raw;
    image.dataset.markoImageStart = String(candidate.start);
    image.dataset.markoImageEnd = String(candidate.end);
    candidateIndex = match + 1;
  }
}

function collectRenderedImageSources(
  source: string,
  documentSource: string,
): RenderedImageSource[] {
  const markdown = collectRenderableMarkdownImageSyntax(source, documentSource)
    .map((item) => ({
      raw: item.raw,
      start: item.start,
      end: item.end,
      alt: stripMarkdownAlt(item.label),
    }));
  const html = collectInlineHtmlMarkupRanges(source)
    .map((range) => ({ ...range, raw: source.slice(range.start, range.end) }))
    .filter((item) => /^<img\b/i.test(item.raw))
    .map((item) => ({
      raw: item.raw,
      start: item.start,
      end: item.end,
      alt: readHtmlImageAlt(item.raw),
    }));
  return [...markdown, ...html].sort((left, right) => left.start - right.start);
}

export function collectRenderableMarkdownImageSyntax(
  source: string,
  documentSource = source,
): InlineMarkdownSyntax[] {
  const definitions = new Set(
    collectReferenceDefinitionSemantics(documentSource)
      .map((definition) => definition.label.normalized),
  );
  return collectInlineMarkdownSyntax(source)
    .filter((item) => item.type === "image")
    .filter((item) => {
      const reference = readMarkdownReferenceLink(item.raw, 1)
        ?? readMarkdownShortcutReferenceLink(item.raw, 1);
      if (!reference || reference.imageStart !== 0) return true;
      const label = reference.referenceLabel || reference.label;
      return definitions.has(normalizeMarkdownReferenceLabel(label));
    });
}

function readHtmlImageAlt(source: string): string {
  const template = document.createElement("template");
  template.innerHTML = source;
  return template.content.querySelector<HTMLImageElement>("img")?.alt ?? "";
}

function stripMarkdownAlt(source: string): string {
  return source
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1")
    .replace(/(?:\*\*|__|~~|==|`+|\*|_)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAlt(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}
