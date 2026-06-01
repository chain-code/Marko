<template>
  <section
    ref="surfaceRef"
    class="block-editor"
    :class="{
      'is-source': settings.sourceMode,
      'is-focus': settings.focusMode,
      'is-typewriter': settings.typewriterMode,
    }"
    :style="editorStyle"
    @dragover.prevent
    @drop.prevent="handleDrop"
  >
    <textarea
      v-if="settings.sourceMode"
      ref="sourceTextareaRef"
      class="source-editor"
      :value="modelValue"
      :spellcheck="settings.spellcheck"
      @input="handleSourceInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @select="emitSelectionFromSource"
      @keyup="emitSelectionFromSource"
      @mouseup="emitSelectionFromSource"
    />

    <template v-else>
      <div
        v-for="block in blocks"
        :key="`${block.start}-${block.index}`"
        class="editor-block"
        :class="[`block-${block.type}`, { active: block.index === activeIndex }]"
        :data-block-index="block.index"
        @click="activateBlock(block.index)"
      >
        <textarea
          v-if="block.index === activeIndex"
          :ref="setActiveTextareaRef"
          v-model="activeDraft"
          class="block-source"
          :spellcheck="settings.spellcheck"
          @input="handleActiveInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
          @blur="handleActiveBlur"
          @select="emitSelectionFromActive"
          @keyup="emitSelectionFromActive"
          @mouseup="emitSelectionFromActive"
        />
        <MarkdownPreview
          v-else
          :source="block.raw"
          :document-source="modelValue"
          :base-path="filePath"
          :outline="outline"
          :settings="settings"
          @toggle-task="toggleTaskInBlock(block.index, $event)"
          @replace-source="replaceBlockSource(block.index, $event)"
        />
      </div>
    </template>

    <div v-if="emojiSuggestions.length > 0" class="emoji-popover">
      <button
        v-for="item in emojiSuggestions"
        :key="item.code"
        type="button"
        class="emoji-option"
        @mousedown.prevent="applyEmoji(item.value)"
      >
        <span>{{ item.value }}</span>
        <span>:{{ item.code }}:</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { getEmojiSuggestions } from "@/utils/markdown";
import { indentSelection, replaceBlock, splitMarkdownBlocks, type MarkdownBlock } from "@/utils/editorBlocks";
import { calculateSelectionStats } from "@/utils/stats";
import type { EditorCommand, EditorSettings, ImagePayload, OutlineItem, SelectionStats } from "@/types";

const props = defineProps<{
  modelValue: string;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
  open: [];
  selection: [stats: SelectionStats];
  imageData: [payload: ImagePayload];
}>();

const surfaceRef = ref<HTMLElement | null>(null);
const activeTextareaRef = ref<HTMLTextAreaElement | null>(null);
const sourceTextareaRef = ref<HTMLTextAreaElement | null>(null);
const activeIndex = ref<number | null>(null);
const activeDraft = ref("");
const activeRange = ref<{ start: number; end: number } | null>(null);
const pendingCommand = ref<{ command: EditorCommand; payload?: string } | null>(null);
const pendingInsert = ref("");
const emojiQuery = ref("");
const emojiRange = ref<{ start: number; end: number } | null>(null);

const blocks = computed(() => splitMarkdownBlocks(props.modelValue));
const emojiSuggestions = computed(() => (emojiQuery.value ? getEmojiSuggestions(emojiQuery.value) : []));

const editorStyle = computed(() => ({
  "--reading-max-width": `${props.settings.lineWidth}px`,
  "--editor-font-size": `${props.settings.fontSize}px`,
}));

watch(activeIndex, async (index) => {
  if (index === null) {
    activeDraft.value = "";
    activeRange.value = null;
    return;
  }

  const block = blocks.value[index];
  if (!block) return;
  activeDraft.value = block.raw;
  activeRange.value = { start: block.start, end: block.end };
  await nextTick();
  resizeTextarea(activeTextareaRef.value);
  activeTextareaRef.value?.focus();
  void runPendingInsert();
  void runPendingCommand();
});

watch(
  () => props.settings.sourceMode,
  async (sourceMode) => {
    activeIndex.value = null;
    await nextTick();
    if (sourceMode) {
      sourceTextareaRef.value?.focus();
    }
  },
);

function activateBlock(index: number) {
  activeIndex.value = index;
}

function setActiveTextareaRef(element: Element | null) {
  activeTextareaRef.value = element instanceof HTMLTextAreaElement ? element : null;
}

function handleActiveInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  activeDraft.value = textarea.value;
  const range = activeRange.value;
  if (!range) return;

  const next = `${props.modelValue.slice(0, range.start)}${activeDraft.value}${props.modelValue.slice(range.end)}`;
  activeRange.value = { start: range.start, end: range.start + activeDraft.value.length };
  emit("update:modelValue", next);
  resizeTextarea(textarea);
  updateEmojiState(textarea);
  if (props.settings.typewriterMode) {
    centerActiveBlock();
  }
}

function handleSourceInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  emit("update:modelValue", textarea.value);
  updateEmojiState(textarea);
}

function handleActiveBlur() {
  window.setTimeout(() => {
    if (document.activeElement !== activeTextareaRef.value) {
      activeIndex.value = null;
      emojiQuery.value = "";
    }
  }, 80);
}

function handleKeydown(event: KeyboardEvent) {
  const textarea = getCurrentTextarea();
  if (!textarea) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    emit("save");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
    event.preventDefault();
    emit("open");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
    event.preventDefault();
    runCommand("bold");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
    event.preventDefault();
    runCommand("italic");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    runCommand("link");
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    applyIndent(event.shiftKey);
    return;
  }

  if (event.key === "Enter" && continueList(textarea)) {
    event.preventDefault();
    return;
  }

  if (props.settings.autoPair && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const pairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}",
      '"': '"',
      "'": "'",
      "`": "`",
    };
    const close = pairs[event.key];
    if (close) {
      event.preventDefault();
      wrapSelection(event.key, close, "");
    }
  }
}

function runCommand(command: EditorCommand, payload?: string) {
  if (["undo", "redo", "copy", "cut", "paste"].includes(command)) {
    document.execCommand(command);
    return;
  }

  if (!getCurrentTextarea() && !props.settings.sourceMode) {
    queueCommand(command, payload);
    return;
  }

  const textarea = ensureTextarea();
  if (!textarea && command !== "toc" && command !== "frontmatter") return;

  switch (command) {
    case "paragraph":
      setParagraph();
      break;
    case "heading1":
      setHeading(1);
      break;
    case "heading2":
      setHeading(2);
      break;
    case "heading3":
      setHeading(3);
      break;
    case "bold":
      wrapSelection("**", "**", "加粗文本");
      break;
    case "italic":
      wrapSelection("*", "*", "斜体文本");
      break;
    case "strike":
      wrapSelection("~~", "~~", "删除线文本");
      break;
    case "inlineCode":
      wrapSelection("`", "`", "code");
      break;
    case "highlight":
      wrapSelection("==", "==", "高亮文本");
      break;
    case "superscript":
      wrapSelection("^", "^", "上标");
      break;
    case "subscript":
      wrapSelection("~", "~", "下标");
      break;
    case "link":
      wrapSelection("[", "](https://example.com)", "链接文本");
      break;
    case "image":
      insertAtCursor("\n![图片描述](image-path)\n");
      break;
    case "blockquote":
      prefixLines("> ");
      break;
    case "bulletList":
      prefixLines("- ");
      break;
    case "orderedList":
      prefixNumberedLines();
      break;
    case "taskList":
      prefixLines("- [ ] ");
      break;
    case "toggleTask":
      toggleCurrentTask();
      break;
    case "hr":
      insertAtCursor("\n---\n");
      break;
    case "codeBlock":
      insertAtCursor("\n```ts\n// 在这里编写代码\n```\n");
      break;
    case "table":
      insertAtCursor("\n| 列 1 | 列 2 | 列 3 |\n| --- | :---: | --- |\n| 内容 | 内容 | 内容 |\n");
      break;
    case "addTableRow":
      editTable("row");
      break;
    case "addTableColumn":
      editTable("column");
      break;
    case "alignLeft":
      alignTable("left");
      break;
    case "alignCenter":
      alignTable("center");
      break;
    case "alignRight":
      alignTable("right");
      break;
    case "toc":
      insertAtCursor("\n[TOC]\n");
      break;
    case "frontmatter":
      insertAtCursor("---\ntitle: 新文档\ndate: 2026-05-25\n---\n\n");
      break;
    case "callout":
      insertAtCursor("\n> [!NOTE]\n> 在这里编写提示内容。\n");
      break;
    case "mermaid":
      insertAtCursor("\n```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```\n");
      break;
    case "flowchart":
      insertAtCursor("\n```flowchart\nst=>start: 开始\ne=>end: 结束\nst->e\n```\n");
      break;
    case "setImageWidth":
      setImageWidth(payload);
      break;
    default:
      break;
  }
}

function insertImageMarkdown(src: string, alt = "图片") {
  insertAtCursor(`\n![${escapeBrackets(alt)}](${src})\n`);
}

function insertText(text: string) {
  insertAtCursor(text);
}

defineExpose({
  runCommand,
  insertImageMarkdown,
  insertText,
  focus() {
    ensureTextarea()?.focus();
  },
});

function ensureTextarea(): HTMLTextAreaElement | null {
  const textarea = getCurrentTextarea();
  if (textarea) return textarea;

  if (!props.settings.sourceMode && activeIndex.value === null) {
    activeIndex.value = getFallbackBlockIndex();
  }
  return activeTextareaRef.value ?? sourceTextareaRef.value;
}

function getCurrentTextarea(): HTMLTextAreaElement | null {
  return props.settings.sourceMode ? sourceTextareaRef.value : activeTextareaRef.value;
}

function queueCommand(command: EditorCommand, payload?: string) {
  pendingCommand.value = { command, payload };
  const current = activeIndex.value;
  const target = current !== null && blocks.value[current] ? current : getFallbackBlockIndex();
  if (activeIndex.value !== target) {
    activeIndex.value = target;
  }
  void runPendingCommand();
}

async function runPendingCommand() {
  await nextTick();
  const pending = pendingCommand.value;
  if (!pending || !getCurrentTextarea()) return;
  pendingCommand.value = null;
  runCommand(pending.command, pending.payload);
}

function queueInsert(text: string) {
  pendingInsert.value += text;
  const current = activeIndex.value;
  const target = current !== null && blocks.value[current] ? current : getFallbackBlockIndex();
  if (activeIndex.value !== target) {
    activeIndex.value = target;
  }
  void runPendingInsert();
}

async function runPendingInsert() {
  await nextTick();
  const text = pendingInsert.value;
  if (!text || !getCurrentTextarea()) return;
  pendingInsert.value = "";
  insertAtCursor(text);
}

function getFallbackBlockIndex(): number {
  const block = blocks.value.find((item) => {
    const trimmed = item.raw.trimStart();
    return item.type !== "frontmatter" && trimmed && !trimmed.startsWith("[^");
  });
  return block?.index ?? Math.max(0, blocks.value.length - 1);
}

function updateTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  if (props.settings.sourceMode) {
    emit("update:modelValue", value);
    nextTick(() => {
      sourceTextareaRef.value?.focus();
    });
    return;
  }

  activeDraft.value = value;
  const range = activeRange.value;
  if (!range) return;
  const next = `${props.modelValue.slice(0, range.start)}${value}${props.modelValue.slice(range.end)}`;
  activeRange.value = { start: range.start, end: range.start + value.length };
  emit("update:modelValue", next);
  nextTick(() => {
    resizeTextarea(textarea);
    textarea.focus();
  });
}

function wrapSelection(before: string, after: string, placeholder: string) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || placeholder;
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
  updateTextareaValue(textarea, next);
  setSelection(textarea, start + before.length, start + before.length + selected.length);
}

function insertAtCursor(text: string) {
  if (!getCurrentTextarea() && !props.settings.sourceMode) {
    queueInsert(text);
    return;
  }

  const textarea = ensureTextarea();
  if (!textarea) return;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
  updateTextareaValue(textarea, next);
  setSelection(textarea, start + text.length, start + text.length);
}

function prefixLines(prefix: string) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const { value, start, end, lineStart, normalizedEnd } = getLineRange(textarea);
  const selected = value.slice(lineStart, normalizedEnd);
  const nextSelected = selected
    .split("\n")
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join("\n");
  const next = `${value.slice(0, lineStart)}${nextSelected}${value.slice(normalizedEnd)}`;
  updateTextareaValue(textarea, next);
  setSelection(textarea, start + prefix.length, end + (nextSelected.length - selected.length));
}

function prefixNumberedLines() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const { value, start, end, lineStart, normalizedEnd } = getLineRange(textarea);
  const selected = value.slice(lineStart, normalizedEnd);
  const nextSelected = selected
    .split("\n")
    .map((line, index) => (line.trim() ? `${index + 1}. ${line}` : line))
    .join("\n");
  const next = `${value.slice(0, lineStart)}${nextSelected}${value.slice(normalizedEnd)}`;
  updateTextareaValue(textarea, next);
  setSelection(textarea, start + 3, end + (nextSelected.length - selected.length));
}

function setHeading(level: 1 | 2 | 3) {
  const textarea = ensureTextarea();
  if (!textarea) return;

  const { value, start, end, lineStart, normalizedEnd } = getLineRange(textarea);
  const selected = value.slice(lineStart, normalizedEnd);
  const prefix = `${"#".repeat(level)} `;
  const nextSelected = selected
    .split("\n")
    .map((line) => {
      const content = line.replace(/^\s{0,3}#{1,6}\s+/, "");
      return content.trim() ? `${prefix}${content}` : content;
    })
    .join("\n");
  updateTextareaValue(textarea, `${value.slice(0, lineStart)}${nextSelected}${value.slice(normalizedEnd)}`);
  setSelection(textarea, Math.min(start + prefix.length, lineStart + nextSelected.length), end + (nextSelected.length - selected.length));
}

function setParagraph() {
  const textarea = ensureTextarea();
  if (!textarea) return;

  const { value, start, end, lineStart, normalizedEnd } = getLineRange(textarea);
  const selected = value.slice(lineStart, normalizedEnd);
  const nextSelected = selected
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, ""))
    .join("\n");
  updateTextareaValue(textarea, `${value.slice(0, lineStart)}${nextSelected}${value.slice(normalizedEnd)}`);
  setSelection(textarea, Math.max(lineStart, start - (selected.length - nextSelected.length)), end - (selected.length - nextSelected.length));
}

function applyIndent(outdent: boolean) {
  const textarea = getCurrentTextarea();
  if (!textarea) return;
  const result = indentSelection(textarea.value, textarea.selectionStart, textarea.selectionEnd, outdent);
  updateTextareaValue(textarea, result.value);
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function continueList(textarea: HTMLTextAreaElement): boolean {
  const value = textarea.value;
  const start = textarea.selectionStart;
  if (start !== textarea.selectionEnd) return false;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const line = value.slice(lineStart, start);
  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
  if (!match) return false;

  if (line.trim() === match[0].trim()) {
    const next = `${value.slice(0, lineStart)}${value.slice(start)}`;
    updateTextareaValue(textarea, next);
    setSelection(textarea, lineStart, lineStart);
    return true;
  }

  let marker = match[2];
  const number = marker.match(/^(\d+)([.)])$/);
  if (number) {
    marker = `${Number(number[1]) + 1}${number[2]}`;
  }
  insertAtCursor(`\n${match[1]}${marker} ${match[3] ?? ""}`);
  return true;
}

function toggleCurrentTask() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const { value, start, lineStart, normalizedEnd } = getLineRange(textarea);
  const line = value.slice(lineStart, normalizedEnd);
  const nextLine = line.replace(/(\[[ xX]\])/, (match) => (match.toLowerCase() === "[x]" ? "[ ]" : "[x]"));
  if (nextLine === line) {
    prefixLines("- [ ] ");
    return;
  }
  updateTextareaValue(textarea, `${value.slice(0, lineStart)}${nextLine}${value.slice(normalizedEnd)}`);
  setSelection(textarea, start, start);
}

function toggleTaskInBlock(blockIndex: number, order: number) {
  const block = blocks.value[blockIndex];
  if (!block) return;
  let seen = -1;
  const nextRaw = block.raw
    .split("\n")
    .map((line) => {
      if (!/^(\s*[-*+]\s+)\[[ xX]\]/.test(line)) return line;
      seen += 1;
      if (seen !== order) return line;
      return line.replace(/\[[ xX]\]/, (match) => (match.toLowerCase() === "[x]" ? "[ ]" : "[x]"));
    })
    .join("\n");
  emit("update:modelValue", replaceBlock(props.modelValue, block, nextRaw));
}

function replaceBlockSource(blockIndex: number, nextRaw: string) {
  const block = blocks.value[blockIndex];
  if (!block) return;
  emit("update:modelValue", replaceBlock(props.modelValue, block, nextRaw));
}

function editTable(kind: "row" | "column") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const lines = textarea.value.split("\n");
  const tableStart = lines.findIndex((line) => /^\|.*\|$/.test(line.trim()));
  if (tableStart < 0 || tableStart + 1 >= lines.length) {
    runCommand("table");
    return;
  }

  if (kind === "row") {
    const columns = splitTableRow(lines[tableStart]).length;
    lines.splice(tableStart + 2, 0, buildTableRow(Array.from({ length: columns }, () => "内容")));
  } else {
    for (let index = tableStart; index < lines.length && /^\|.*\|$/.test(lines[index].trim()); index += 1) {
      const cells = splitTableRow(lines[index]);
      cells.push(index === tableStart ? "新列" : index === tableStart + 1 ? "---" : "内容");
      lines[index] = buildTableRow(cells);
    }
  }

  updateTextareaValue(textarea, lines.join("\n"));
}

function alignTable(align: "left" | "center" | "right") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const lines = textarea.value.split("\n");
  const separator = lines.findIndex((line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim()));
  if (separator < 0) return;

  const cells = splitTableRow(lines[separator]);
  const marker = align === "left" ? ":---" : align === "right" ? "---:" : ":---:";
  lines[separator] = buildTableRow(cells.map(() => marker));
  updateTextareaValue(textarea, lines.join("\n"));
}

function setImageWidth(widthPayload?: string) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const width = widthPayload || window.prompt("图片宽度，例如 480 或 60%", "480");
  if (!width) return;

  const { value, lineStart, normalizedEnd } = getLineRange(textarea);
  const line = value.slice(lineStart, normalizedEnd);
  const match = line.match(/!\[([^\]]*)]\(([^)]+)\)/);
  if (!match) return;

  const size = /^\d+$/.test(width) ? `${width}px` : width;
  const nextLine = `<img src="${match[2]}" alt="${match[1]}" width="${size}">`;
  updateTextareaValue(textarea, `${value.slice(0, lineStart)}${nextLine}${value.slice(normalizedEnd)}`);
}

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function buildTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function getLineRange(textarea: HTMLTextAreaElement) {
  const value = textarea.value;
  let start = textarea.selectionStart;
  let end = textarea.selectionEnd;
  if (start === end && start > 0 && start === value.length && value.endsWith("\n")) {
    start -= 1;
    end -= 1;
  }
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const normalizedEnd = lineEnd === -1 ? value.length : lineEnd;
  return { value, start, end, lineStart, normalizedEnd };
}

function updateEmojiState(textarea: HTMLTextAreaElement) {
  const before = textarea.value.slice(0, textarea.selectionStart);
  const match = before.match(/:([a-z0-9_+-]{1,20})$/i);
  if (!match) {
    emojiQuery.value = "";
    emojiRange.value = null;
    return;
  }

  emojiQuery.value = match[1];
  emojiRange.value = {
    start: textarea.selectionStart - match[0].length,
    end: textarea.selectionStart,
  };
}

function applyEmoji(value: string) {
  const textarea = getCurrentTextarea();
  const range = emojiRange.value;
  if (!textarea || !range) return;

  const next = `${textarea.value.slice(0, range.start)}${value}${textarea.value.slice(range.end)}`;
  updateTextareaValue(textarea, next);
  setSelection(textarea, range.start + value.length, range.start + value.length);
  emojiQuery.value = "";
  emojiRange.value = null;
}

async function handlePaste(event: ClipboardEvent) {
  const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  emit("imageData", {
    name: file.name || `paste-${Date.now()}.png`,
    dataUrl: await fileToDataUrl(file),
  });
}

async function handleDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((item) => item.type.startsWith("image/"));
  if (files.length === 0) return;
  event.stopPropagation();
  activateDroppedBlock(event);
  for (const file of files) {
    emit("imageData", {
      name: file.name || `drop-${Date.now()}.png`,
      dataUrl: await fileToDataUrl(file),
    });
  }
}

function activateDroppedBlock(event: DragEvent) {
  if (props.settings.sourceMode) return;
  const target = event.target instanceof Element ? event.target : null;
  const block = target?.closest<HTMLElement>(".editor-block");
  const index = Number(block?.dataset.blockIndex);
  if (Number.isInteger(index) && blocks.value[index]) {
    activeIndex.value = index;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function emitSelectionFromActive() {
  const textarea = activeTextareaRef.value;
  if (!textarea) return;
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  emit("selection", calculateSelectionStats(selected));
}

function emitSelectionFromSource() {
  const textarea = sourceTextareaRef.value;
  if (!textarea) return;
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  emit("selection", calculateSelectionStats(selected));
}

function setSelection(textarea: HTMLTextAreaElement, start: number, end: number) {
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(start, end);
    updateEmojiState(textarea);
  });
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(96, textarea.scrollHeight + 2)}px`;
}

function centerActiveBlock() {
  const current = activeTextareaRef.value?.closest(".editor-block");
  current?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function escapeBrackets(value: string): string {
  return value.replace(/[[\]]/g, "");
}
</script>

<style scoped>
.block-editor {
  position: relative;
  width: 100%;
  min-height: 100%;
  padding: 2.2rem 1.2rem 5rem;
}

.editor-block {
  width: 100%;
  max-width: var(--reading-max-width);
  min-height: 1.4rem;
  margin: 0 auto;
  border-radius: 8px;
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.editor-block:hover:not(.active) {
  background: rgba(59, 130, 246, 0.035);
}

.editor-block.active {
  background: rgba(59, 130, 246, 0.055);
  box-shadow: inset 3px 0 0 rgba(59, 130, 246, 0.38);
}

.block-source,
.source-editor {
  display: block;
  width: 100%;
  border: 1px solid #c9d5e7;
  border-radius: 8px;
  background: #fcfdff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
  color: var(--text-main);
  font-family: "JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo,
    monospace;
  font-size: var(--editor-font-size);
  line-height: 1.7;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.85rem 1rem;
  resize: none;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
}

:global(:root[data-theme="dark"]) .block-source,
:global(:root[data-theme="dark"]) .source-editor {
  border-color: var(--border-strong);
  background: #111820;
  color: var(--text-main);
}

.block-source {
  min-height: 96px;
}

.source-editor {
  min-height: calc(100vh - 190px);
  max-width: var(--reading-max-width);
  margin: 0 auto;
}

.emoji-popover {
  position: sticky;
  bottom: 1rem;
  z-index: 12;
  display: grid;
  gap: 0.25rem;
  width: min(280px, calc(100vw - 2rem));
  margin: 0 auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.35rem;
}

.emoji-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  padding: 0.42rem 0.55rem;
}

.emoji-option:hover {
  background: var(--accent-soft);
}

.emoji-option span:last-child {
  color: var(--muted);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 0.78rem;
}

@media print {
  .block-editor {
    padding: 0;
  }

  .editor-block {
    max-width: none;
  }
}
</style>
