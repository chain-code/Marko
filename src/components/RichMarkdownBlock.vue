<template>
  <div
    ref="rootRef"
    class="rich-markdown-block"
    :class="{
      'has-inline-source': inlineSourceVisible,
      'is-block-editor-child': embeddedBlock,
      'wrap-code-blocks': settings.codeWrap,
    }"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    :spellcheck="settings.spellcheck"
    @focus="handleFocus"
    @focusout="handleFocusOut"
    @beforeinput="handleBeforeInput"
    @input="commit"
    @keydown="handleKeydown"
    @click="handleClick"
    @keyup="emitSelection"
    @mouseup="emitSelection"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { resolveLocalAsset } from "@/services/desktop";
import { convertRichHtmlToMarkdown } from "@/utils/editorCommands";
import { collectInlineMarkdownSyntax, type InlineMarkdownSyntax } from "@/utils/inlineSyntax";
import {
  collectRenderableMarkdownImageSyntax,
  getImageFromErrorFallback,
  prepareRenderedImages,
} from "@/utils/imageRendering";
import { renderMarkdown } from "@/utils/markdown";
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import type { EditorCommand, EditorSettings, OutlineItem } from "@/types";

const props = defineProps<{
  source: string;
  documentSource: string;
  sourceOffset?: number;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  embeddedBlock?: boolean;
}>();

const emit = defineEmits<{
  update: [value: string];
  focus: [];
  blur: [];
  selection: [text: string];
  sourceEdit: [];
  openLink: [href: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const inlineSourceVisible = ref(false);
let lastEmitted = "";
let savedRange: Range | null = null;

onMounted(() => {
  renderSource();
  document.addEventListener("mousedown", handleDocumentMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocumentMouseDown);
});

watch(
  () => [
    props.source,
    props.documentSource,
    props.sourceOffset ?? -1,
    props.filePath ?? "",
    JSON.stringify(props.outline),
    props.settings.theme,
    JSON.stringify(props.settings.extensions),
    props.settings.smartQuotes,
    props.settings.smartDashes,
    props.settings.preserveSingleLineBreaks,
    props.settings.codeLineNumbers,
    props.settings.autoNumberingForMath,
  ] as const,
  (current, previous) => {
    const sourceChanged = current[0] !== previous[0];
    const renderDependencyChanged = current
      .slice(1)
      .some((value, index) => value !== previous[index + 1]);
    const isSourceEcho = sourceChanged && current[0] === lastEmitted;

    if (sourceChanged) {
      lastEmitted = "";
    }
    if (isSourceEcho && !renderDependencyChanged) {
      return;
    }

    if (renderDependencyChanged || document.activeElement !== rootRef.value) {
      renderSource();
    }
  },
);

function renderSource() {
  if (!rootRef.value) return;
  inlineSourceVisible.value = false;
  rootRef.value.innerHTML = sanitizeMarkdownHtml(renderMarkdown(props.source, {
    basePath: props.filePath,
    documentSource: props.documentSource,
    sourceOffset: props.sourceOffset,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
    preserveSourceTokens: true,
  }));
  annotateStandaloneImageParagraphs(rootRef.value);
  annotateInlineSyntax();
  prepareRenderedImages(rootRef.value, props.source, undefined, props.documentSource);
}

function annotateStandaloneImageParagraphs(root: HTMLElement) {
  root.querySelectorAll<HTMLParagraphElement>("p").forEach((paragraph) => {
    paragraph.classList.toggle("standalone-image-paragraph", isStandaloneImageParagraph(paragraph));
  });
}

function isStandaloneImageParagraph(paragraph: HTMLParagraphElement) {
  const children = meaningfulChildNodes(paragraph);
  if (children.length !== 1) return false;

  const child = children[0];
  if (!(child instanceof HTMLElement)) return false;
  if (child.matches("img")) return true;
  if (!child.matches("a[href]")) return false;

  const linkedChildren = meaningfulChildNodes(child);
  return linkedChildren.length === 1
    && linkedChildren[0] instanceof HTMLImageElement;
}

function meaningfulChildNodes(element: Element) {
  return Array.from(element.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
    return node.nodeType === Node.ELEMENT_NODE;
  });
}

function commit() {
  const root = rootRef.value;
  if (!root) return;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".marko-image-error-source").forEach((fallback) => fallback.remove());
  clone.querySelectorAll<HTMLImageElement>("img[data-marko-image-state]").forEach((image) => {
    delete image.dataset.markoImageState;
    delete image.dataset.markoImageStateBound;
    delete image.dataset.markoImageSource;
    delete image.dataset.markoImageStart;
    delete image.dataset.markoImageEnd;
    image.classList.remove("marko-image-error");
    image.removeAttribute("aria-invalid");
    if (!image.className) image.removeAttribute("class");
  });
  const converted = convertRichHtmlToMarkdown(clone.innerHTML);
  const markdown = converted ?? root.innerText.replace(/\r?\n/g, "\n").trim();
  const trailing = props.source.match(/(?:\r?\n)+$/)?.[0] ?? "";
  const next = markdown ? `${markdown}${trailing}` : trailing;
  lastEmitted = next;
  emit("update", next);
  emitSelection();
}

function handleBeforeInput() {
  releasePreservedSourceAtSelection();
}

function handleFocus() {
  emit("focus");
}

function handleFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (next instanceof Node && rootRef.value?.contains(next)) return;
  renderSource();
  emit("blur");
}

function handleDocumentMouseDown(event: MouseEvent) {
  const target = event.target;
  if (!inlineSourceVisible.value || !(target instanceof Node) || rootRef.value?.contains(target)) return;
  renderSource();
  emit("blur");
}

function handleClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("[data-marko-inline-source]")) return;

  const preservedText = target?.closest<HTMLElement>('[data-marko-source-token="text"]');
  if (preservedText && !preservedText.closest("a[href]")) {
    event.preventDefault();
    event.stopPropagation();
    revealPreservedTextSource(preservedText);
    return;
  }

  const checkbox = target?.closest<HTMLInputElement>("input[type='checkbox']");
  if (checkbox) {
    void nextTick(commit);
    return;
  }

  const image = target?.closest<HTMLImageElement>("img")
    ?? getImageFromErrorFallback(target);
  if (image && rootRef.value?.contains(image)) {
    event.preventDefault();
    event.stopPropagation();
    const linked = image.closest<HTMLAnchorElement>("a[href]");
    if (shouldOpenPreviewLink(event) && linked) {
      emit("openLink", linked.getAttribute("href") ?? "");
      return;
    }
    revealImageSource(image);
    return;
  }

  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;
  event.preventDefault();
  event.stopPropagation();
  if (shouldOpenPreviewLink(event)) {
    emit("openLink", anchor.getAttribute("href") ?? "");
    return;
  }
  revealLinkSource(anchor);
}

function revealLinkSource(anchor: HTMLAnchorElement) {
  const syntax = findSyntaxForElement("link", anchor, "a[href]");
  if (!syntax) return;
  const source = createInlineSource(syntax, "link-markdown-source");
  anchor.replaceWith(source);
  focusInlineSource(source, syntax);
}

function revealImageSource(image: HTMLImageElement) {
  if (image.dataset.markoSyntaxPreview === "true") return;
  const syntax = findSyntaxForElement("image", image, "img");
  if (!syntax) return;
  const source = createInlineSource(syntax, "image-markdown-source");
  image.closest("a[href]")?.removeAttribute("data-marko-inline-markdown");
  const fallback = image.previousElementSibling;
  if (fallback instanceof HTMLElement && fallback.classList.contains("marko-image-error-source")) {
    fallback.remove();
  }
  image.dataset.markoSyntaxPreview = "true";
  image.setAttribute("contenteditable", "false");
  image.before(source);
  focusInlineSource(source, syntax);
}

function findSyntaxForElement(
  type: InlineMarkdownSyntax["type"],
  element: Element,
  selector: string,
): InlineMarkdownSyntax | null {
  const annotatedType = element.getAttribute("data-marko-inline-type")
    ?? (element.hasAttribute("data-marko-image-source") ? "image" : null);
  if (annotatedType === type) {
    const raw = element.getAttribute("data-marko-inline-markdown")
      ?? element.getAttribute("data-marko-image-source")
      ?? "";
    const start = Number(element.getAttribute("data-marko-inline-start") ?? element.getAttribute("data-marko-image-start"));
    const end = Number(element.getAttribute("data-marko-inline-end") ?? element.getAttribute("data-marko-image-end"));
    if (raw && Number.isFinite(start) && Number.isFinite(end)) {
      return { type, raw, start, end, label: "" };
    }
    if (raw && element.getAttribute("data-marko-source-token") === "link") {
      return { type, raw, start: 0, end: raw.length, label: element.textContent ?? "" };
    }
  }

  const root = rootRef.value;
  if (!root) return null;
  const elements = Array.from(root.querySelectorAll(selector));
  const items = type === "image"
    ? collectRenderableMarkdownImageSyntax(props.source, props.documentSource)
    : collectInlineMarkdownSyntax(props.source).filter((item) => item.type === type);
  if (elements.length !== items.length) return null;
  return items[elements.indexOf(element)] ?? null;
}

function annotateInlineSyntax() {
  annotateSyntaxType("link", "a[href]");
  annotateSyntaxType("image", "img");
}

function annotateSyntaxType(type: InlineMarkdownSyntax["type"], selector: string) {
  const root = rootRef.value;
  if (!root) return;
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const items = type === "image"
    ? collectRenderableMarkdownImageSyntax(props.source, props.documentSource)
    : collectInlineMarkdownSyntax(props.source).filter((item) => item.type === type);
  let elementIndex = 0;

  items.forEach((item, itemIndex) => {
    let match = -1;
    for (let index = elementIndex; index < elements.length; index += 1) {
      if (elementMatchesSyntax(elements[index], item)) {
        match = index;
        break;
      }
    }
    if (match < 0 && elements.length === items.length) match = itemIndex;
    if (match < 0) return;
    const element = elements[match];
    element.dataset.markoInlineType = item.type;
    element.dataset.markoInlineMarkdown = item.raw;
    element.dataset.markoInlineStart = String(item.start);
    element.dataset.markoInlineEnd = String(item.end);
    elementIndex = match + 1;
  });
}

function elementMatchesSyntax(element: HTMLElement, syntax: InlineMarkdownSyntax) {
  const elementLabel = element instanceof HTMLImageElement ? element.alt : element.textContent ?? "";
  const label = document.createElement("span");
  label.innerHTML = sanitizeMarkdownHtml(renderMarkdown(syntax.label, {
    basePath: props.filePath,
    documentSource: props.documentSource,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  }));
  return normalizeLabel(elementLabel) === normalizeLabel(label.textContent ?? "");
}

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createInlineSource(syntax: InlineMarkdownSyntax, className: string) {
  const source = document.createElement("span");
  source.className = `inline-markdown-source ${className}`;
  source.dataset.markoInlineSource = syntax.type;
  source.textContent = syntax.raw;
  inlineSourceVisible.value = true;
  return source;
}

function revealPreservedTextSource(element: HTMLElement) {
  const raw = element.getAttribute("data-marko-inline-markdown") ?? "";
  if (!raw) return;
  const source = document.createElement("span");
  source.className = "inline-markdown-source text-markdown-source";
  source.dataset.markoInlineSource = "text";
  source.textContent = raw;
  inlineSourceVisible.value = true;
  element.replaceWith(source);
  focusInlineSource(source, { type: "link", raw, start: 0, end: raw.length, label: raw });
}

function releasePreservedSourceAtSelection() {
  const root = rootRef.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  root.querySelectorAll<HTMLElement>("[data-marko-inline-markdown]").forEach((element) => {
    let intersects = false;
    try {
      intersects = range.intersectsNode(element);
    } catch {
      intersects = element.contains(selection.anchorNode) || element.contains(selection.focusNode);
    }
    if (!intersects) return;
    element.removeAttribute("data-marko-inline-markdown");
    element.removeAttribute("data-marko-source-token");
  });
}

function focusInlineSource(source: HTMLElement, syntax: InlineMarkdownSyntax) {
  const text = source.firstChild;
  if (!text) return;
  const selection = window.getSelection();
  const range = document.createRange();
  const destination = syntax.raw.indexOf("](");
  const start = destination >= 0 ? destination + 2 : syntax.raw.length;
  const end = destination >= 0 ? Math.max(start, syntax.raw.lastIndexOf(")")) : syntax.raw.length;
  range.setStart(text, Math.min(start, text.textContent?.length ?? 0));
  range.setEnd(text, Math.min(end, text.textContent?.length ?? 0));
  selection?.removeAllRanges();
  selection?.addRange(range);
  rootRef.value?.focus();
  savedRange = range.cloneRange();
  emit("selection", selection?.toString() ?? "");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    document.execCommand(event.shiftKey ? "insertLineBreak" : "insertParagraph");
    commit();
    return;
  }

  if (event.key === "Tab") {
    const listItem = selectionElement()?.closest("li");
    if (listItem) {
      event.preventDefault();
      document.execCommand(event.shiftKey ? "outdent" : "indent");
      commit();
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    renderSource();
    rootRef.value?.blur();
    return;
  }

  if (!(event.ctrlKey || event.metaKey)) return;
  const command = event.key.toLowerCase();
  if (command === "b" || command === "i" || command === "u") {
    event.preventDefault();
    runCommand(command === "b" ? "bold" : command === "i" ? "italic" : "underline");
  }
}

function runCommand(command: EditorCommand, payload?: string): boolean {
  const root = rootRef.value;
  if (!root) return false;
  root.focus();
  restoreSelection();
  releasePreservedSourceAtSelection();

  const nativeCommands: Partial<Record<EditorCommand, string>> = {
    undo: "undo",
    redo: "redo",
    bold: "bold",
    italic: "italic",
    underline: "underline",
    strike: "strikeThrough",
    clearFormat: "removeFormat",
    orderedList: "insertOrderedList",
    bulletList: "insertUnorderedList",
    indent: "indent",
    outdent: "outdent",
  };
  const native = nativeCommands[command];
  if (native) {
    document.execCommand(native);
    commit();
    return true;
  }

  if (command === "paragraph" || /^heading[1-6]$/.test(command)) {
    const tag = command === "paragraph" ? "p" : `h${command.slice(-1)}`;
    document.execCommand("formatBlock", false, tag);
    commit();
    return true;
  }

  if (command === "blockquote") {
    document.execCommand("formatBlock", false, "blockquote");
    commit();
    return true;
  }

  if (command === "highlight") {
    document.execCommand("hiliteColor", false, "rgba(250, 204, 21, 0.42)");
    commit();
    return true;
  }

  if (command === "inlineCode") {
    return wrapSelectionWithTag("code");
  }

  if (command === "superscript" || command === "subscript") {
    document.execCommand(command);
    commit();
    return true;
  }

  if (command === "link") {
    const href = payload || "https://";
    if (!href) return true;
    document.execCommand("createLink", false, href);
    commit();
    return true;
  }

  if (command === "copy" || command === "cut" || command === "paste" || command === "selectAll") {
    document.execCommand(command);
    return true;
  }

  return false;
}

function wrapSelectionWithTag(tag: string): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!rootRef.value?.contains(range.commonAncestorContainer)) return false;
  const element = document.createElement(tag);
  try {
    range.surroundContents(element);
  } catch {
    element.append(range.extractContents());
    range.insertNode(element);
  }
  selection.removeAllRanges();
  range.selectNodeContents(element);
  selection.addRange(range);
  commit();
  return true;
}

function emitSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !rootRef.value?.contains(selection.anchorNode)) return;
  savedRange = selection.getRangeAt(0).cloneRange();
  emit("selection", selection.toString());
}

function restoreSelection() {
  if (!savedRange || !rootRef.value?.contains(savedRange.commonAncestorContainer)) return;
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(savedRange);
}

function selectionElement(): Element | null {
  const node = window.getSelection()?.anchorNode;
  if (node instanceof Element) return node;
  return node?.parentElement ?? null;
}

function focus() {
  void nextTick(() => rootRef.value?.focus());
}

defineExpose({ focus, runCommand });
</script>

<style scoped>
.rich-markdown-block {
  --markdown-text: #333333;
  --markdown-muted: #777777;
  --markdown-border: #dfe2e5;
  --markdown-heading-rule: #eeeeee;
  --markdown-horizontal-rule: #e7e7e7;
  --markdown-link: #4183c4;
  box-sizing: border-box;
  width: 100%;
  min-height: 1.7em;
  color: var(--markdown-text);
  font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, "Segoe UI Emoji", "SF Pro", sans-serif;
  font-size: var(--editor-font-size);
  line-height: 1.6;
  outline: none;
  padding: 30px 30px 100px;
  text-rendering: auto;
  word-break: normal;
  word-wrap: break-word;
}


:global([data-theme="dark"] .rich-markdown-block) {
  --markdown-text: var(--text-main);
  --markdown-muted: var(--muted);
  --markdown-border: var(--border);
  --markdown-heading-rule: var(--heading-rule);
  --markdown-horizontal-rule: var(--heading-rule);
  --markdown-link: var(--accent-strong);
}

.rich-markdown-block.is-block-editor-child {
  padding: 0;
}
.rich-markdown-block:focus {
  caret-color: var(--markdown-text);
}

.rich-markdown-block :deep(.inline-markdown-source) {
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.86em;
  white-space: pre-wrap;
}

.rich-markdown-block :deep(.link-markdown-source) {
  color: var(--accent-strong);
}

.rich-markdown-block :deep(.image-markdown-source) {
  display: block;
  margin: 0.2rem 0 0.45rem;
}

.rich-markdown-block :deep(img) {
  display: inline-block;
  max-width: 100%;
  border-radius: 0;
  margin: 0;
  vertical-align: middle;
}

.rich-markdown-block :deep(img:not([height])) {
  height: auto;
}

.rich-markdown-block :deep(video) {
  display: block;
  max-width: 100%;
  margin: 0 auto;
}

.rich-markdown-block :deep(audio) {
  max-width: 100%;
}

.rich-markdown-block :deep(iframe) {
  width: 100%;
  max-width: 100%;
  border: 0;
  margin: 0 auto;
}

.rich-markdown-block :deep(.standalone-image-paragraph > img),
.rich-markdown-block :deep(.standalone-image-paragraph > a > img) {
  display: block;
  margin: auto;
}

.rich-markdown-block.is-block-editor-child :deep(> :first-child) {
  margin-top: 0;
}

.rich-markdown-block.is-block-editor-child :deep(> :last-child) {
  margin-bottom: 0;
}

.rich-markdown-block :deep(h1),
.rich-markdown-block :deep(h2),
.rich-markdown-block :deep(h3),
.rich-markdown-block :deep(h4),
.rich-markdown-block :deep(h5),
.rich-markdown-block :deep(h6) {
  margin: 1rem 0;
  font-weight: 700;
  line-height: 1.4;
  white-space: pre-wrap;
}

.rich-markdown-block :deep(h1) {
  border-bottom: 1px solid var(--markdown-heading-rule);
  padding-bottom: 0.125em;
  font-size: 2.25em;
  line-height: 1.2;
}

.rich-markdown-block :deep(h2) {
  border-bottom: 1px solid var(--markdown-heading-rule);
  padding-bottom: 0.125em;
  font-size: 1.75em;
  line-height: 1.225;
}

.rich-markdown-block :deep(h3) {
  font-size: 1.5em;
  line-height: 1.43;
}

.rich-markdown-block :deep(h4) {
  font-size: 1.25em;
}

.rich-markdown-block :deep(h5),
.rich-markdown-block :deep(h6) {
  font-size: 1em;
}

.rich-markdown-block :deep(h6) {
  color: var(--markdown-muted);
}

.rich-markdown-block :deep(h1 code),
.rich-markdown-block :deep(h2 code),
.rich-markdown-block :deep(h3 code),
.rich-markdown-block :deep(h4 code),
.rich-markdown-block :deep(h5 code),
.rich-markdown-block :deep(h6 code) {
  font-size: inherit;
}

.rich-markdown-block :deep(h1 tt),
.rich-markdown-block :deep(h2 tt),
.rich-markdown-block :deep(h3 tt),
.rich-markdown-block :deep(h4 tt),
.rich-markdown-block :deep(h5 tt),
.rich-markdown-block :deep(h6 tt) {
  font-size: inherit;
}

.rich-markdown-block :deep(p) {
  margin: 0.8em 0;
}

.rich-markdown-block :deep(ul),
.rich-markdown-block :deep(ol) {
  margin: 0.8em 0;
  padding-inline-start: 1.875rem;
}

.rich-markdown-block :deep(ul:first-child),
.rich-markdown-block :deep(ol:first-child) {
  margin-top: 0;
}

.rich-markdown-block :deep(ul:last-child),
.rich-markdown-block :deep(ol:last-child) {
  margin-bottom: 0;
}

.rich-markdown-block:not(.is-block-editor-child) :deep(> ul:first-child),
.rich-markdown-block:not(.is-block-editor-child) :deep(> ol:first-child) {
  margin-top: 0.8em;
}

.rich-markdown-block :deep(li) {
  margin: 0;
  padding-inline-start: 0;
  position: relative;
}

.rich-markdown-block :deep(ul) {
  list-style-type: disc;
}

.rich-markdown-block :deep(ul ul) {
  list-style-type: circle;
}

.rich-markdown-block :deep(ul ul ul) {
  list-style-type: square;
}

.rich-markdown-block :deep(ul > li)::marker {
  color: var(--markdown-text);
  font-size: 1.2em;
  font-weight: 650;
}

.rich-markdown-block :deep(li > ul),
.rich-markdown-block :deep(li > ol) {
  margin: 0;
}

.rich-markdown-block :deep(li > :first-child) {
  margin-top: 0;
}

.rich-markdown-block :deep(li > figure:last-child) {
  margin-bottom: 0.5rem;
}

.rich-markdown-block :deep(li > p),
.rich-markdown-block :deep(td p) {
  margin: 0.5rem 0;
}

.rich-markdown-block :deep(dl) {
  margin: 0.8em 0;
}

.rich-markdown-block :deep(dt) {
  color: inherit;
  font-weight: 400;
  margin: 0;
}

.rich-markdown-block :deep(dd) {
  border: 0;
  color: inherit;
  margin: 0 0 0 40px;
  padding: 0;
}

.rich-markdown-block :deep(a) {
  color: var(--markdown-link);
}

.rich-markdown-block :deep(abbr[title]) {
  cursor: help;
  text-decoration: underline dotted;

}

.rich-markdown-block :deep(kbd) {
  border: 1px solid #adb3b9;
  border-radius: 3px;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(12, 13, 14, 0.2), 0 0 0 2px #ffffff inset;
  color: #242729;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.8em;
  margin: 0 0.1em;
  padding: 0.1em 0.6em;
  white-space: nowrap;
  vertical-align: middle;
}

:global(:root[data-theme="dark"] .rich-markdown-block kbd) {
  border-color: var(--border-strong);
  background: var(--panel-subtle);
  box-shadow: none;
  color: var(--text-main);
}

.rich-markdown-block :deep(code),
.rich-markdown-block :deep(tt) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

.rich-markdown-block :deep(pre) {
  overflow-x: auto;
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f8f8f8;
  margin: 15px 0;
  padding: 8px 4px 6px;
  font-size: 0.9em;
  line-height: 1.5;
}

.rich-markdown-block :deep(pre code) {
  border: 0;
  background: transparent;
  font-size: inherit;
  padding: 0;
}

.rich-markdown-block :deep(pre.code-with-line-numbers) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.85rem;
}

.rich-markdown-block :deep(pre.code-with-line-numbers::before) {
  content: attr(data-line-numbers);
  border-right: 1px solid var(--border);
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  line-height: inherit;
  padding-right: 0.72rem;
  text-align: right;
  white-space: pre;
  user-select: none;
}

.rich-markdown-block.wrap-code-blocks :deep(pre) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.rich-markdown-block :deep(blockquote) {
  border-left: 4px solid var(--markdown-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  color: var(--markdown-muted);
  margin: 0.8em 0;
  padding: 0 15px;
}

.rich-markdown-block :deep(blockquote blockquote) {
  padding-right: 0;
}

.rich-markdown-block :deep(blockquote p),
.rich-markdown-block :deep(blockquote li) {
  color: inherit;
}

.rich-markdown-block :deep(blockquote > :first-child) {
  margin-top: 0;
}

.rich-markdown-block :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.rich-markdown-block :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  padding: 0;
  word-break: initial;
}

.rich-markdown-block :deep(figure.table-figure) {
  overflow-x: auto;
  max-width: calc(100% + 16px);
  margin: 1.2em 0;
  padding: 0;
}

.rich-markdown-block :deep(figure:not(.table-figure)) {
  overflow-x: auto;
  max-width: calc(100% + 16px);
  margin: 1.2em 0;
}

.rich-markdown-block :deep(figure.table-figure > table) {
  margin: 0;
}

.rich-markdown-block :deep(table tr) {
  border: 1px solid var(--markdown-border);
  margin: 0;
  padding: 0;
}

.rich-markdown-block :deep(table tr:nth-child(2n)),
.rich-markdown-block :deep(thead) {
  background: #f8f8f8;
}

.rich-markdown-block :deep(th) {
  border: 1px solid var(--markdown-border);
  border-bottom: 0;
  font-weight: 700;
  margin: 0;
  padding: 6px 13px;
  text-align: left;
}

.rich-markdown-block :deep(td) {
  border: 1px solid var(--markdown-border);
  min-width: 32px;
  margin: 0;
  padding: 6px 13px;
}

.rich-markdown-block :deep(hr) {
  box-sizing: content-box;
  height: 2px;
  overflow: hidden;
  border: 0;
  background: var(--markdown-horizontal-rule);
  margin: 16px 0;
  padding: 0;
}

.rich-markdown-block::selection,
.rich-markdown-block :deep(::selection) {
  background: #dae3ea;
  color: inherit;
}

.rich-markdown-block :deep(.task-list-item-checkbox) {
  position: absolute;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  margin-left: -1.3em;
  margin-top: calc(1em - 10px);
  border: none;
  cursor: pointer;
}

.rich-markdown-block :deep(ul > .task-list-item),
.rich-markdown-block :deep(ol > .task-list-item) {
  list-style: none;
}

.rich-markdown-block :deep(.frontmatter-block) {
  overflow-x: hidden;
  border: 0;
  border-radius: 3px;
  background: #f7f7f7;
  color: var(--muted);
  font-size: 0.85em;
  line-height: 1.45;
  margin-top: 0;
  min-height: 0.8rem;
  padding: 1rem;
  white-space: pre-wrap;
}

:global([data-theme="dark"] .rich-markdown-block .frontmatter-block) {
  background: var(--panel-subtle);
}

.rich-markdown-block :deep(.toc-inline) {
  border: 0;
  background: transparent;
  font-size: 0.9em;
  margin: 20px 0 0;
  min-height: 3.58rem;
  padding: 0 0 20px;
}

.rich-markdown-block :deep(.toc-inline ul) {
  margin: 0;
  padding-left: 0;
}

.rich-markdown-block :deep(.toc-inline-item) {
  list-style: none;
  margin: 0;
}

.rich-markdown-block :deep(.toc-inline a) {
  text-decoration: none;
}

.rich-markdown-block :deep(.toc-inline a:hover) {
  text-decoration: underline;
}

.rich-markdown-block :deep(.toc-inline-item.lv-1) {
  font-weight: 700;
}

.rich-markdown-block :deep(.toc-inline-item.lv-2) {
  padding-left: 2em;
}

.rich-markdown-block :deep(.toc-inline-item.lv-3) {
  padding-left: 4em;
}

.rich-markdown-block :deep(.toc-inline-item.lv-4) {
  padding-left: 6em;
}

.rich-markdown-block :deep(.toc-inline-item.lv-5) {
  padding-left: 8em;
}

.rich-markdown-block :deep(.toc-inline-item.lv-6) {
  padding-left: 10em;
}

@media screen and (max-width: 48em) {
  .rich-markdown-block :deep(.toc-inline-item.lv-3) {
    padding-left: 3.5em;
  }

  .rich-markdown-block :deep(.toc-inline-item.lv-4) {
    padding-left: 5em;
  }

  .rich-markdown-block :deep(.toc-inline-item.lv-5) {
    padding-left: 6.5em;
  }

  .rich-markdown-block :deep(.toc-inline-item.lv-6) {
    padding-left: 8em;
  }
}

.rich-markdown-block :deep(.md-alert) {
  border: 0;
  border-left: 4px solid #0969da;
  border-radius: 0;
  background: transparent;
  color: inherit;
  margin: 0 0 16px;
  padding: 0 1em;
}

.rich-markdown-block :deep(.md-alert-title) {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  padding: 0;
}

.rich-markdown-block :deep(.md-alert-title .md-alert-icon) {
  display: inline-block;
  width: 1em;
  height: 1em;
  fill: currentColor;
  margin-right: 1ch;
  overflow: visible;
  position: relative;
  top: 0.125em;
}

.rich-markdown-block :deep(.md-alert-tip) {
  border-left-color: #1f883d;
}

.rich-markdown-block :deep(.md-alert-note .md-alert-title) {
  color: #0969da;
}

.rich-markdown-block :deep(.md-alert-tip .md-alert-title) {
  color: #1f883d;
}

.rich-markdown-block :deep(.md-alert-important) {
  border-left-color: #8250df;
}

.rich-markdown-block :deep(.md-alert-important .md-alert-title) {
  color: #8250df;
}

.rich-markdown-block :deep(.md-alert-warning) {
  border-left-color: #9a6700;
}

.rich-markdown-block :deep(.md-alert-warning .md-alert-title) {
  color: #9a6700;
}

.rich-markdown-block :deep(.md-alert-caution) {
  border-left-color: #cf222e;
}

.rich-markdown-block :deep(.md-alert-caution .md-alert-title) {
  color: #cf222e;
}

.rich-markdown-block :deep(.footnotes) {
  color: var(--muted);
  font-size: 0.9em;
  margin: 1em 0;
  opacity: 0.8;
  padding: 0;
}

.rich-markdown-block :deep(.footnote-ref) {
  display: initial;
  border-radius: 4px;
  background: rgba(238, 238, 238, 0.7);
  color: #555555;
  cursor: pointer;
  margin-inline: 0;
  padding: 2px 4px;
}

.rich-markdown-block :deep(.footnote-ref a),
.rich-markdown-block :deep(.footnote-ref a:hover) {
  color: inherit;
  text-decoration: inherit;
  text-transform: inherit;
}

:global(:root[data-theme="dark"] .rich-markdown-block .footnote-ref) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
}

.rich-markdown-block :deep(.math-inline) {
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  font-size: 0.95em;
  vertical-align: -0.08em;
}

.rich-markdown-block :deep(.math-block) {
  overflow-x: auto;
  margin: 16px 0;
  padding: 0;
  text-align: center;
}

.rich-markdown-block :deep(.math-inline mjx-container[jax="SVG"]),
.rich-markdown-block :deep(.math-block mjx-container[jax="SVG"]) {
  color: currentColor;
  max-width: 100%;
}

.rich-markdown-block :deep(.math-inline mjx-container[jax="SVG"] svg),
.rich-markdown-block :deep(.math-block mjx-container[jax="SVG"] svg) {
  max-width: 100%;
}

:global(:root[data-theme="dark"] .rich-markdown-block code),
:global(:root[data-theme="dark"] .rich-markdown-block tt) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

:global(:root[data-theme="dark"] .rich-markdown-block pre code) {
  border: 0;
  background: transparent;
}

:global(:root[data-theme="dark"] .rich-markdown-block pre) {
  border-color: var(--border);
  background: #111820;
}

:global(:root[data-theme="dark"] .rich-markdown-block table tr:nth-child(2n)),
:global(:root[data-theme="dark"] .rich-markdown-block thead) {
  background: var(--panel-subtle);
}

:global(:root[data-theme="dark"] .rich-markdown-block blockquote) {
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
}

:deep(.marko-image-error-source),
:deep(.marko-image-reference-missing) {
  display: inline;
  padding: 0.12rem 0.32rem;
  border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--border));
  border-radius: 3px;
  background: var(--danger-soft);
  color: var(--danger);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.88em;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

:deep(.marko-image-error-source) {
  cursor: text;
}

:deep(img.marko-image-error) {
  display: none !important;
}
</style>
