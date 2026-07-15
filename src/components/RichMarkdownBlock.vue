<template>
  <div
    ref="rootRef"
    class="rich-markdown-block"
    :class="{ 'has-inline-source': inlineSourceVisible }"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    :spellcheck="settings.spellcheck"
    @focus="handleFocus"
    @focusout="handleFocusOut"
    @input="commit"
    @keydown="handleKeydown"
    @click="handleClick"
    @keyup="emitSelection"
    @mouseup="emitSelection"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { convertRichHtmlToMarkdown } from "@/utils/editorCommands";
import { collectInlineMarkdownSyntax, type InlineMarkdownSyntax } from "@/utils/inlineSyntax";
import { renderMarkdown } from "@/utils/markdown";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import type { EditorCommand, EditorSettings, OutlineItem } from "@/types";

const props = defineProps<{
  source: string;
  documentSource: string;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
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
    props.settings.theme,
    props.settings.extensions,
  ],
  () => {
    if (props.source === lastEmitted) {
      lastEmitted = "";
      return;
    }
    if (document.activeElement !== rootRef.value) renderSource();
  },
  { deep: true },
);

function renderSource() {
  if (!rootRef.value) return;
  inlineSourceVisible.value = false;
  rootRef.value.innerHTML = renderMarkdown(props.source, {
    basePath: props.filePath,
    documentSource: props.documentSource,
    outline: props.outline,
    settings: props.settings,
  });
  annotateInlineSyntax();
}

function commit() {
  const root = rootRef.value;
  if (!root) return;
  const converted = convertRichHtmlToMarkdown(root.innerHTML);
  const markdown = converted ?? root.innerText.replace(/\r?\n/g, "\n").trim();
  const trailing = props.source.match(/(?:\r?\n)+$/)?.[0] ?? "";
  const next = markdown ? `${markdown}${trailing}` : trailing;
  lastEmitted = next;
  emit("update", next);
  emitSelection();
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

  const checkbox = target?.closest<HTMLInputElement>("input[type='checkbox']");
  if (checkbox) {
    void nextTick(commit);
    return;
  }

  const image = target?.closest<HTMLImageElement>("img");
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
  if (element.getAttribute("data-marko-inline-type") === type) {
    const raw = element.getAttribute("data-marko-inline-markdown") ?? "";
    const start = Number(element.getAttribute("data-marko-inline-start"));
    const end = Number(element.getAttribute("data-marko-inline-end"));
    if (raw && Number.isFinite(start) && Number.isFinite(end)) {
      return { type, raw, start, end, label: "" };
    }
  }

  const root = rootRef.value;
  if (!root) return null;
  const elements = Array.from(root.querySelectorAll(selector));
  const items = collectInlineMarkdownSyntax(props.source).filter((item) => item.type === type);
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
  const items = collectInlineMarkdownSyntax(props.source).filter((item) => item.type === type);
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
  label.innerHTML = renderMarkdown(syntax.label, {
    basePath: props.filePath,
    documentSource: props.documentSource,
    outline: props.outline,
    settings: props.settings,
  });
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
    document.execCommand("insertLineBreak");
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
  width: 100%;
  min-height: 1.7em;
  color: var(--text-main);
  font-size: var(--editor-font-size);
  line-height: 1.74;
  outline: none;
  padding: 0.2rem 0.5rem 0.35rem;
  word-break: break-word;
}

.rich-markdown-block:focus {
  caret-color: var(--accent-strong);
}

.rich-markdown-block :deep(.inline-markdown-source) {
  color: var(--muted);
  font-family: "JetBrains Mono", Consolas, monospace;
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

.rich-markdown-block :deep(> :first-child) {
  margin-top: 0;
}

.rich-markdown-block :deep(> :last-child) {
  margin-bottom: 0;
}

.rich-markdown-block :deep(h1),
.rich-markdown-block :deep(h2),
.rich-markdown-block :deep(h3),
.rich-markdown-block :deep(h4),
.rich-markdown-block :deep(h5),
.rich-markdown-block :deep(h6) {
  line-height: 1.24;
  font-weight: 620;
}

.rich-markdown-block :deep(h1) {
  border-bottom: 1px solid var(--heading-rule);
  font-size: 2.05rem;
  margin: 0 0 1.15rem;
  padding-bottom: 0.55rem;
}

.rich-markdown-block :deep(h2) {
  border-bottom: 1px solid var(--heading-rule);
  font-size: 1.35rem;
  margin: 2.05rem 0 0.86rem;
}

.rich-markdown-block :deep(h3) {
  font-size: 1.16rem;
  margin: 1.55rem 0 0.65rem;
  padding-left: 0.9rem;
}

.rich-markdown-block :deep(h4),
.rich-markdown-block :deep(h5),
.rich-markdown-block :deep(h6) {
  font-size: 1.02rem;
  margin: 1.25rem 0 0.5rem;
  padding-left: 1.2rem;
}

.rich-markdown-block :deep(p) {
  margin: 0.8em 0;
  padding-inline-start: 0.48rem;
}

.rich-markdown-block :deep(ul),
.rich-markdown-block :deep(ol) {
  margin: 0.8em 0;
  padding-inline-start: 1.875rem;
}

.rich-markdown-block :deep(li) {
  margin: 0;
}

.rich-markdown-block :deep(ul > li)::marker {
  color: var(--text-main);
  font-size: 1.2em;
  font-weight: 650;
}

.rich-markdown-block :deep(li > ul),
.rich-markdown-block :deep(li > ol) {
  margin: 0;
}

.rich-markdown-block :deep(a) {
  color: var(--accent-strong);
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.35);
  text-underline-offset: 0.16rem;
}

.rich-markdown-block :deep(code) {
  border: 1px solid #dbe3f0;
  border-radius: 5px;
  background: #f5f8fd;
  color: #223046;
  font-size: 0.86em;
  padding: 0.08rem 0.35rem;
}

.rich-markdown-block :deep(blockquote) {
  border-left: 3px solid var(--border);
  border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  margin: 1.05rem 0;
  padding: 0.75rem 1rem;
}

.rich-markdown-block :deep(.task-list-item-checkbox) {
  width: 1rem;
  height: 1rem;
  margin: 0 0.48rem 0 -1.35rem;
}

:global(:root[data-theme="dark"]) .rich-markdown-block :deep(code) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

:global(:root[data-theme="dark"]) .rich-markdown-block :deep(blockquote) {
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
}
</style>
