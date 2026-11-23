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
    @contextmenu.prevent="openEditorContextMenu"
  >
    <textarea
      v-if="settings.sourceMode"
      ref="sourceTextareaRef"
      class="source-editor"
      lang="en"
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
        :key="block.index"
        class="editor-block"
        :class="[
          'block-' + block.type,
          {
            active: block.index === activeIndex || block.index === activeRichIndex || block.index === activeTableIndex,
            'is-document-first': block.index === 0,
            'is-document-last': block.index === blocks.length - 1,
          },
        ]"
        :data-block-index="block.index"
        @click="activateSourceBlock(block)"
      >
        <VisualTableEditor
          v-if="block.type === 'table' && block.index !== activeIndex"
          :ref="(editor) => setTableEditorRef(block.index, editor)"
          :source="block.raw"
          :document-source="modelValue"
          :file-path="filePath"
          :source-offset="block.start"
          :outline="outline"
          :settings="settings"
          @update="replaceBlockSource(block.index, $event)"
          @delete="deleteVisualBlock(block.index)"
          @focus="activateTableBlock(block.index)"
          @selection="emitVisualSelection(block, $event)"
          @open-link="emit('openLinkHref', $event)"
        />
        <RichMarkdownBlock
          v-else-if="block.index !== activeIndex && isRichEditableBlock(block)"
          :ref="(editor) => setRichEditorRef(block.index, editor)"
          :source="block.raw"
          :document-source="modelValue"
          :source-offset="block.start"
          :file-path="filePath"
          :outline="outline"
          :settings="settings"
          @update="replaceBlockSource(block.index, $event)"
          embedded-block
          @focus="activateRichBlock(block.index)"
          @selection="emitVisualSelection(block, $event)"
          @open-link="emit('openLinkHref', $event)"
        />
        <textarea
          v-else-if="block.index === activeIndex"
          :ref="setActiveTextareaRef"
          v-model="activeDraft"
          class="block-source"
          lang="en"
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
          :source-offset="block.start"
          :base-path="filePath"
          :outline="outline"
          :settings="settings"
          @toggle-task="toggleTaskInBlock(block.index, $event)"
          embedded-block
          @replace-source="replaceBlockSource(block.index, $event)"
          @open-link="emit('openLink', $event)"
          @open-anchor="emit('openLinkHref', $event)"
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

    <div
      v-if="contextMenu"
      class="editor-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      role="menu"
      @click.stop
      @contextmenu.prevent
    >
      <template v-for="(item, index) in contextMenu.items" :key="`editor-context-${index}`">
        <div v-if="item.type === 'separator'" class="context-menu-separator" />
        <button
          v-else
          type="button"
          class="context-menu-item"
          role="menuitem"
          @click="runEditorContextMenuCommand(item.command)"
        >
          <component :is="contextActionIcon(item.command)" />
          <span>{{ item.label }}</span>
          <small v-if="item.shortcut">{{ item.shortcut }}</small>
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Bold,
  ClipboardPaste,
  Code,
  Copy,
  Italic,
  Link,
  Redo2,
  RemoveFormatting,
  Scissors,
  TextSelect,
  Undo2,
} from "lucide-vue-next";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import VisualTableEditor from "@/components/VisualTableEditor.vue";
import { getEmojiCompletionRange } from "@/utils/continuousEditor";
import { getEmojiSuggestions } from "@/utils/markdown";
import {
  clampEditorContextMenuPosition,
  editorContextMenuItems,
  type EditorContextMenuItem,
} from "@/utils/editorContextMenu";
import { insertFrontMatterSnippet } from "@/utils/snippets";
import { indentSelection, replaceBlock, splitMarkdownBlocks, type MarkdownBlock } from "@/utils/editorBlocks";
import { getKeyboardShortcutPlatform, resolveEditorShortcut } from "@/utils/keyboardShortcuts";
import { getDocumentBoundaryOffset } from "@/utils/textPosition";
import { isMarkdownTocLine } from "@/utils/tocSyntax";
import {
  alignMarkdownTable,
  adjustHeadingLevel,
  applyDefaultCodeLanguageOnFenceKey,
  applyMarkdownSpaceShortcut,
  applyAutoPair,
  clearMarkdownFormatting,
  continueMarkdownBlock,
  deleteCurrentWord,
  deleteCurrentParagraph,
  deleteCurrentSentence,
  deleteCurrentStyleScope,
  deleteMarkdownTable,
  deleteMarkdownLines,
  deleteMarkdownTablePart,
  duplicateMarkdownLines,
  editMarkdownTable,
  formatMarkdownCodeBlock,
  formatMarkdownMathBlock,
  formatMarkdownLines,
  getSelectedMarkdownHtml,
  getSelectedMarkdownSource,
  getPlainTextFromMarkdownSelection,
  getSelectAllTarget,
  insertMarkdownCalloutTemplate,
  insertMarkdownDiagramTemplate,
  insertMarkdownFootnoteTemplate,
  insertMarkdownHorizontalRule,
  insertMarkdownImageSelection,
  insertMarkdownLinkSelection,
  insertMarkdownSoftBreak,
  insertMarkdownTableTemplate,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  insertMarkdownTocTemplate,
  insertMarkdownAtSelection,
  moveMarkdownLines,
  moveMarkdownTableColumn,
  moveMarkdownTableRow,
  navigateMarkdownTableCell,
  outdentMarkdownListOnBackspace,
  pasteMarkdownContent,
  pastePlainMarkdownText,
  removeAutoPairOnBackspace,
  selectCurrentLine,
  selectCurrentParagraph,
  selectCurrentSentence,
  selectCurrentStyleScope,
  selectCurrentWord,
  selectMarkdownTablePart,
  setHeadingLevel,
  setImageWidthInLine,
  setParagraphText,
  toggleMarkdownTaskByOrder,
  toggleTaskAtSelection,
  unwrapMarkdownBlockOnBackspace,
  wrapHtmlCommentSelection,
  wrapMarkdownSelection,
  type TextEditResult,
} from "@/utils/editorCommands";
import { getCodeFenceInfoString } from "@/utils/codeFenceLanguage";
import {
  resolveDefaultCodeLanguage,
  type DefaultCodeLanguageChannel,
} from "@/utils/codeLanguagePreference";
import { findMarkdownLinkAtCursor } from "@/utils/markdownLinks";
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
  saveAs: [];
  open: [];
  selection: [stats: SelectionStats];
  imageData: [payload: ImagePayload];
  openLink: [path: string];
  openLinkHref: [href: string];
  missingLink: [];
  requestSourceSelection: [start: number, end: number];
}>();

const surfaceRef = ref<HTMLElement | null>(null);
const activeTextareaRef = ref<HTMLTextAreaElement | null>(null);
const sourceTextareaRef = ref<HTMLTextAreaElement | null>(null);
const activeIndex = ref<number | null>(null);
const activeRichIndex = ref<number | null>(null);
const activeTableIndex = ref<number | null>(null);
const richEditorRefs = new Map<number, InstanceType<typeof RichMarkdownBlock>>();
const tableEditorRefs = new Map<number, InstanceType<typeof VisualTableEditor>>();
const activeDraft = ref("");
const activeRange = ref<{ start: number; end: number } | null>(null);
const pendingCommand = ref<{ command: EditorCommand; payload?: string } | null>(null);
const pendingInsert = ref("");
const emojiQuery = ref("");
const emojiRange = ref<{ start: number; end: number } | null>(null);
const contextMenu = ref<{ items: EditorContextMenuItem[]; x: number; y: number } | null>(null);
const lastCodeLanguage = ref("");

const contextActionIcons: Partial<Record<EditorCommand, unknown>> = {
  undo: Undo2,
  redo: Redo2,
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  pastePlainText: ClipboardPaste,
  copyMarkdown: Copy,
  copyHtml: Copy,
  copyPlainText: Copy,
  selectAll: TextSelect,
  link: Link,
  openLink: Link,
  bold: Bold,
  italic: Italic,
  inlineCode: Code,
  clearFormat: RemoveFormatting,
};

const blocks = computed(() => splitMarkdownBlocks(props.modelValue));
const emojiSuggestions = computed(() => (emojiQuery.value ? getEmojiSuggestions(emojiQuery.value) : []));

const editorStyle = computed(() => ({
  "--reading-max-width": `${props.settings.lineWidth}px`,
  "--editor-font-size": `${props.settings.fontSize}px`,
  "--editor-tab-size": String(props.settings.indentSize),
}));

watch(activeIndex, async (index) => {
  if (index === null) {
    activeDraft.value = "";
    activeRange.value = null;
    return;
  }

  const block = blocks.value[index];
  if (!block) return;
  if (block.type === "code") {
    lastCodeLanguage.value = getCodeFenceInfoString(block.raw)?.value ?? "";
  }
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

onMounted(() => {
  window.addEventListener("click", closeEditorContextMenu);
  window.addEventListener("keydown", handleEditorContextMenuKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeEditorContextMenu);
  window.removeEventListener("keydown", handleEditorContextMenuKeydown);
});

function activateBlock(index: number) {
  activeRichIndex.value = null;
  activeTableIndex.value = null;
  activeIndex.value = index;
}

function activateSourceBlock(block: MarkdownBlock) {
  if (block.type === "table" || isRichEditableBlock(block)) return;
  activateBlock(block.index);
}

function activateRichBlock(index: number) {
  activeIndex.value = null;
  activeTableIndex.value = null;
  activeRichIndex.value = index;
}

function activateTableBlock(index: number) {
  activeIndex.value = null;
  activeRichIndex.value = null;
  activeTableIndex.value = index;
}

function setRichEditorRef(index: number, editor: unknown) {
  if (editor) {
    richEditorRefs.set(index, editor as InstanceType<typeof RichMarkdownBlock>);
  } else {
    richEditorRefs.delete(index);
  }
}

function setTableEditorRef(index: number, editor: unknown) {
  if (editor) {
    tableEditorRefs.set(index, editor as InstanceType<typeof VisualTableEditor>);
  } else {
    tableEditorRefs.delete(index);
  }
}

function isRichEditableBlock(block: MarkdownBlock) {
  if (!["paragraph", "heading", "list", "task", "quote", "definition"].includes(block.type)) return false;
  return !block.raw.split(/\r?\n/).some(isMarkdownTocLine)
    && !/(^|\n)\s*>\s*\[![A-Z]+\]/.test(block.raw)
    && !/\[\^[^\]]+\]/.test(block.raw)
    && !/(^|[^\\])\$[^\n$]+\$/.test(block.raw)
    && !/\\\([^\n]+\\\)/.test(block.raw);
}

function deleteVisualBlock(blockIndex: number) {
  const block = blocks.value[blockIndex];
  if (!block) return;
  replaceBlockSource(blockIndex, block.raw.match(/\s+$/)?.[0] ?? "");
  activeTableIndex.value = null;
}

function emitVisualSelection(block: MarkdownBlock, selected: string) {
  const localStart = selected ? Math.max(0, block.raw.indexOf(selected)) : 0;
  const selectionStart = block.start + localStart;
  const selectionEnd = selectionStart + selected.length;
  emitSelectionFromText(selected, selectionStart, selectionEnd);
}

function tryRunVisualCommand(command: EditorCommand, payload?: string): boolean {
  if (activeTableIndex.value !== null) {
    const editor = tableEditorRefs.get(activeTableIndex.value);
    if (editor?.runCommand(command, payload)) return true;
  }

  if (activeRichIndex.value !== null) {
    const editor = richEditorRefs.get(activeRichIndex.value);
    if (editor?.runCommand(command, payload)) return true;
  }

  return false;
}

function queueVisualSourceCommand(command: EditorCommand, payload?: string): boolean {
  const index = activeRichIndex.value ?? activeTableIndex.value;
  if (index === null || !blocks.value[index]) return false;
  pendingCommand.value = { command, payload };
  activateBlock(index);
  return true;
}

function setActiveTextareaRef(element: unknown) {
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
  emitSelectionFromActive();
  if (props.settings.typewriterMode && props.settings.typewriterCenter) {
    centerActiveBlock();
  }
}

function handleSourceInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  emit("update:modelValue", textarea.value);
  updateEmojiState(textarea);
  emitSelectionFromSource();
}

function handleActiveBlur() {
  window.setTimeout(() => {
    if (document.activeElement !== activeTextareaRef.value) {
      activeIndex.value = null;
      emojiQuery.value = "";
    }
  }, 80);
}

function openEditorContextMenu(event: MouseEvent) {
  activateContextMenuBlock(event);
  const position = clampEditorContextMenuPosition(
    event.clientX,
    event.clientY,
    window.innerWidth,
    window.innerHeight,
    editorContextMenuItems.length,
  );

  contextMenu.value = {
    items: editorContextMenuItems,
    ...position,
  };
}

function activateContextMenuBlock(event: MouseEvent) {
  if (props.settings.sourceMode || event.target instanceof HTMLTextAreaElement) return;

  const target = event.target instanceof Element ? event.target : null;
  const block = target?.closest<HTMLElement>(".editor-block");
  const index = Number(block?.dataset.blockIndex);
  const markdownBlock = blocks.value[index];
  if (!Number.isInteger(index) || !markdownBlock) return;
  if (markdownBlock.type === "table") {
    activateTableBlock(index);
  } else if (isRichEditableBlock(markdownBlock)) {
    activateRichBlock(index);
  } else {
    activateBlock(index);
  }
}

async function runEditorContextMenuCommand(command: EditorCommand) {
  closeEditorContextMenu();
  await nextTick();
  runCommand(command);
}

function contextActionIcon(command: EditorCommand): unknown {
  return contextActionIcons[command] ?? Copy;
}

function closeEditorContextMenu() {
  contextMenu.value = null;
}

function handleEditorContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeEditorContextMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  const textarea = getCurrentTextarea();
  if (!textarea) return;

  const shortcut = resolveEditorShortcut(event, getKeyboardShortcutPlatform());
  if (shortcut) {
    event.preventDefault();
    runShortcut(shortcut);
    return;
  }

  if (event.key === "Escape" && props.settings.emojiAutocomplete === "escape") {
    event.preventDefault();
    if (updateEmojiState(textarea, true)) return;
  }

  if (event.key === "Escape" && !props.settings.sourceMode) {
    event.preventDefault();
    activeIndex.value = null;
    emojiQuery.value = "";
    emojiRange.value = null;
    return;
  }

  if (
    !props.settings.sourceMode
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey
    && (event.key === "`" || event.key === "~")
  ) {
    const language = getDefaultCodeLanguage("markdown");
    const result = applyDefaultCodeLanguageOnFenceKey({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, event.key, language);
    if (result) {
      event.preventDefault();
      lastCodeLanguage.value = language;
      applyTextEdit(textarea, result);
      return;
    }
  }

  if (event.key === "Tab") {
    event.preventDefault();
    if (navigateTableCell(textarea, event.shiftKey ? "previous" : "next")) {
      return;
    }
    applyIndent(event.shiftKey);
    return;
  }

  if (event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    insertSoftBreak(textarea);
    return;
  }

  if (event.key === "Enter" && continueBlock(textarea)) {
    event.preventDefault();
    return;
  }

  if (event.key === " " && applySpaceShortcut(textarea)) {
    event.preventDefault();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Backspace") {
    const result = outdentMarkdownListOnBackspace({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, props.settings.indentSize);
    if (result) {
      event.preventDefault();
      applyTextEdit(textarea, result);
      return;
    }

    const blockResult = unwrapMarkdownBlockOnBackspace({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    });
    if (blockResult) {
      event.preventDefault();
      applyTextEdit(textarea, blockResult);
      return;
    }
  }

  if (props.settings.autoPair && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key === "Backspace") {
      const result = removeAutoPairOnBackspace({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      });
      if (result) {
        event.preventDefault();
        applyTextEdit(textarea, result);
      }
      return;
    }

    const result = applyAutoPair({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, event.key);
    if (result) {
      event.preventDefault();
      applyTextEdit(textarea, result);
    }
  }
}

function runShortcut(shortcut: ReturnType<typeof resolveEditorShortcut>) {
  if (!shortcut) return;
  switch (shortcut.type) {
    case "save":
      emit("save");
      break;
    case "saveAs":
      emit("saveAs");
      break;
    case "open":
      emit("open");
      break;
    case "command":
      runCommand(shortcut.command);
      break;
    default:
      break;
  }
}

function runCommand(command: EditorCommand, payload?: string) {
  if (tryRunVisualCommand(command, payload)) {
    return;
  }

  if (command === "copy" && props.settings.copyMarkdownAsPlainText) {
    void copyMarkdownSource();
    return;
  }

  if (["undo", "redo", "copy", "cut", "paste"].includes(command)) {
    document.execCommand(command);
    return;
  }

  if (!getCurrentTextarea() && !props.settings.sourceMode) {
    if (!queueVisualSourceCommand(command, payload)) {
      queueCommand(command, payload);
    }
    return;
  }

  const textarea = ensureTextarea();
  if (!textarea && command !== "toc" && command !== "frontmatter") return;

  switch (command) {
    case "paragraph":
      setParagraph();
      break;
    case "increaseHeading":
      adjustHeading("increase");
      break;
    case "decreaseHeading":
      adjustHeading("decrease");
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
    case "heading4":
      setHeading(4);
      break;
    case "heading5":
      setHeading(5);
      break;
    case "heading6":
      setHeading(6);
      break;
    case "selectLine":
      selectLine();
      break;
    case "selectParagraph":
      selectParagraph();
      break;
    case "selectSentence":
      selectSentence();
      break;
    case "selectWord":
      selectWord();
      break;
    case "goToDocumentStart":
      void selectDocumentBoundary("start");
      break;
    case "goToDocumentEnd":
      void selectDocumentBoundary("end");
      break;
    case "deleteWord":
      deleteWord();
      break;
    case "deleteSentence":
      deleteSentence();
      break;
    case "deleteParagraph":
      deleteParagraph();
      break;
    case "deleteStyleScope":
      deleteStyleScope();
      break;
    case "copyMarkdown":
      void copyMarkdownSource();
      break;
    case "copyHtml":
      void copyHtmlSource();
      break;
    case "copyPlainText":
      void copyPlainTextSource();
      break;
    case "pastePlainText":
      void pastePlainTextFromClipboard();
      break;
    case "duplicateLine":
      duplicateLines();
      break;
    case "deleteLine":
      deleteLines();
      break;
    case "moveLineUp":
      moveLines("up");
      break;
    case "moveLineDown":
      moveLines("down");
      break;
    case "selectAll":
      selectAllText();
      break;
    case "selectStyleScope":
      selectStyleScope();
      break;
    case "indent":
      applyIndent(false);
      break;
    case "outdent":
      applyIndent(true);
      break;
    case "bold":
      wrapSelection("**", "**", "加粗文本");
      break;
    case "italic":
      wrapSelection("*", "*", "斜体文本");
      break;
    case "underline":
      wrapSelection("<u>", "</u>", "下划线文本");
      break;
    case "strike":
      wrapSelection("~~", "~~", "删除线文本");
      break;
    case "inlineCode":
      wrapSelection("`", "`", "code");
      break;
    case "inlineMath":
      wrapSelection("$", "$", "a^2 + b^2 = c^2");
      break;
    case "mathBlock":
      setMathBlock();
      break;
    case "footnote":
      insertFootnoteTemplate();
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
    case "comment":
      wrapComment();
      break;
    case "clearFormat":
      clearFormat();
      break;
    case "link":
      insertLink();
      break;
    case "openLink":
      openCurrentLink();
      break;
    case "image":
      insertImage();
      break;
    case "blockquote":
      setLineFormat("blockquote");
      break;
    case "bulletList":
      setLineFormat("bullet");
      break;
    case "orderedList":
      setLineFormat("ordered");
      break;
    case "taskList":
      setLineFormat("task");
      break;
    case "definitionList":
      setLineFormat("definition");
      break;
    case "toggleTask":
      toggleCurrentTask();
      break;
    case "hr":
      insertHorizontalRule();
      break;
    case "codeBlock":
      setCodeBlock();
      break;
    case "table":
      insertTableTemplate();
      break;
    case "addTableRow":
      editTable("row");
      break;
    case "addTableColumn":
      editTable("column");
      break;
    case "addTableRowAbove":
      insertTableRow("above");
      break;
    case "addTableRowBelow":
      insertTableRow("below");
      break;
    case "addTableColumnLeft":
      insertTableColumn("left");
      break;
    case "addTableColumnRight":
      insertTableColumn("right");
      break;
    case "moveTableRowUp":
      moveTableRow("up");
      break;
    case "moveTableRowDown":
      moveTableRow("down");
      break;
    case "moveTableColumnLeft":
      moveTableColumn("left");
      break;
    case "moveTableColumnRight":
      moveTableColumn("right");
      break;
    case "selectTableCell":
      selectTable("cell");
      break;
    case "selectTableRow":
      selectTable("row");
      break;
    case "selectTableColumn":
      selectTable("column");
      break;
    case "selectTable":
      selectTable("table");
      break;
    case "deleteTableRow":
      deleteTable("row");
      break;
    case "deleteTableColumn":
      deleteTable("column");
      break;
    case "deleteTable":
      deleteWholeTable();
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
      insertTocTemplate();
      break;
    case "frontmatter":
      insertFrontMatter();
      break;
    case "callout":
      insertCalloutTemplate(payload);
      break;
    case "mermaid":
      insertDiagramTemplate("mermaid");
      break;
    case "flowchart":
      insertDiagramTemplate("flowchart");
      break;
    case "sequence":
      insertDiagramTemplate("sequence");
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

function openCurrentLink() {
  const textarea = ensureTextarea();
  if (!textarea) {
    emit("missingLink");
    return;
  }

  const baseOffset = props.settings.sourceMode ? 0 : (activeRange.value?.start ?? 0);
  const link = findMarkdownLinkAtCursor(
    props.modelValue,
    baseOffset + textarea.selectionStart,
    baseOffset + textarea.selectionEnd,
  );
  if (!link) {
    emit("missingLink");
    return;
  }

  emit("openLinkHref", link.href);
}

function insertFrontMatter() {
  const result = insertFrontMatterSnippet(props.modelValue);
  emit("update:modelValue", result.value);
  window.setTimeout(() => {
    void selectRange(result.selectionStart, result.selectionEnd);
  }, 100);
}

defineExpose({
  runCommand,
  insertImageMarkdown,
  insertText,
  selectRange,
  jumpToSelection,
  focus() {
    ensureTextarea()?.focus();
  },
});

async function selectRange(start: number, end: number) {
  if (props.settings.sourceMode) {
    await nextTick();
    const textarea = sourceTextareaRef.value;
    textarea?.focus();
    textarea?.setSelectionRange(start, end);
    return;
  }

  const block = blocks.value.find((item) => start >= item.start && start <= item.end) ?? blocks.value[0];
  if (!block) return;

  activeIndex.value = block.index;
  await nextTick();
  await nextTick();
  const textarea = activeTextareaRef.value;
  if (!textarea) return;

  const localStart = Math.max(0, start - block.start);
  const localEnd = Math.max(localStart, Math.min(block.raw.length, end - block.start));
  textarea.focus();
  textarea.setSelectionRange(localStart, localEnd);
  emitSelectionFromText(
    textarea.value.slice(localStart, localEnd),
    block.start + localStart,
    block.start + localEnd,
  );
}

async function jumpToSelection() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  await nextTick();
  textarea.focus();
  const block = textarea.closest(".editor-block") ?? textarea;
  block.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function selectDocumentBoundary(boundary: "start" | "end") {
  const offset = getDocumentBoundaryOffset(props.modelValue, boundary);
  await selectRange(offset, offset);
  await jumpToSelection();
}

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

function applyTextEdit(textarea: HTMLTextAreaElement, result: TextEditResult) {
  updateTextareaValue(textarea, result.value);
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function wrapSelection(before: string, after: string, placeholder: string) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    wrapMarkdownSelection(
      { value: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd },
      before,
      after,
      placeholder,
    ),
  );
}

function wrapComment() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    wrapHtmlCommentSelection({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function insertLink() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownLinkSelection({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function insertImage() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownImageSelection({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function insertTableTemplate() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownTableTemplate({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function insertCalloutTemplate(kind?: string) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownCalloutTemplate({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, kind),
  );
}

function insertHorizontalRule() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownHorizontalRule({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function insertTocTemplate() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownTocTemplate({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function insertFootnoteTemplate() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const range = props.settings.sourceMode ? null : activeRange.value;
  const selectionStart = (range?.start ?? 0) + textarea.selectionStart;
  const selectionEnd = (range?.start ?? 0) + textarea.selectionEnd;
  const result = insertMarkdownFootnoteTemplate({
    value: props.settings.sourceMode ? textarea.value : props.modelValue,
    selectionStart,
    selectionEnd,
  });

  emit("update:modelValue", result.value);
  window.setTimeout(() => {
    void selectRange(result.selectionStart, result.selectionEnd);
  }, 100);
}

function insertDiagramTemplate(language: "mermaid" | "flowchart" | "sequence") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownDiagramTemplate({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, language),
  );
}

function insertAtCursor(text: string) {
  if (!getCurrentTextarea() && !props.settings.sourceMode) {
    queueInsert(text);
    return;
  }

  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownAtSelection({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, text),
  );
}

function setLineFormat(format: "blockquote" | "bullet" | "ordered" | "task" | "definition") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    formatMarkdownLines({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, format),
  );
}

function setHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    setHeadingLevel({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, level),
  );
}

function adjustHeading(direction: "increase" | "decrease") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    adjustHeadingLevel({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, direction),
  );
}

function clearFormat() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    clearMarkdownFormatting({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function setParagraph() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    setParagraphText({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function setCodeBlock() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    formatMarkdownCodeBlock({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, getDefaultCodeLanguage("menu")),
  );
}

function getDefaultCodeLanguage(channel: DefaultCodeLanguageChannel): string {
  return resolveDefaultCodeLanguage(
    props.settings.defaultCodeLanguage,
    props.settings.defaultCodeLanguageApplyTo,
    channel,
    lastCodeLanguage.value,
  );
}

function setMathBlock() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    formatMarkdownMathBlock({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function applyIndent(outdent: boolean) {
  const textarea = getCurrentTextarea();
  if (!textarea) return;
  const result = indentSelection(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    outdent,
    props.settings.indentSize,
  );
  updateTextareaValue(textarea, result.value);
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function insertSoftBreak(textarea: HTMLTextAreaElement) {
  applyTextEdit(
    textarea,
    insertMarkdownSoftBreak({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function navigateTableCell(textarea: HTMLTextAreaElement, direction: "next" | "previous"): boolean {
  const result = navigateMarkdownTableCell({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, direction);
  if (!result) return false;
  applyTextEdit(textarea, result);
  return true;
}

function selectLine() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = selectCurrentLine({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  });
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function selectParagraph() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = selectCurrentParagraph({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  });
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function selectWord() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = selectCurrentWord({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  });
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function selectSentence() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = selectCurrentSentence({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  });
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function selectStyleScope() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = selectCurrentStyleScope({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  });
  setSelection(textarea, result.selectionStart, result.selectionEnd);
}

function deleteWord() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    deleteCurrentWord({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function deleteSentence() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    deleteCurrentSentence({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function deleteParagraph() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    deleteCurrentParagraph({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function deleteStyleScope() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    deleteCurrentStyleScope({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function selectAllText() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const target = getSelectAllTarget(props.settings.sourceMode, props.modelValue.length, textarea.value.length);
  if (target.sourceModeRequired) {
    emit("requestSourceSelection", target.selectionStart, target.selectionEnd);
    return;
  }

  setSelection(textarea, target.selectionStart, target.selectionEnd);
}

async function copyMarkdownSource() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const markdownSource = getSelectedMarkdownSource(
    props.settings.sourceMode,
    props.modelValue,
    textarea.value,
    activeRange.value?.start ?? 0,
    textarea.selectionStart,
    textarea.selectionEnd,
  );
  if (!markdownSource) return;

  try {
    await navigator.clipboard.writeText(markdownSource);
  } catch {
    document.execCommand("copy");
  }
}

async function copyPlainTextSource() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const markdownSource = getSelectedMarkdownSource(
    props.settings.sourceMode,
    props.modelValue,
    textarea.value,
    activeRange.value?.start ?? 0,
    textarea.selectionStart,
    textarea.selectionEnd,
  );
  if (!markdownSource) return;

  try {
    await navigator.clipboard.writeText(getPlainTextFromMarkdownSelection(markdownSource));
  } catch {
    document.execCommand("copy");
  }
}

async function copyHtmlSource() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const markdownSource = getSelectedMarkdownSource(
    props.settings.sourceMode,
    props.modelValue,
    textarea.value,
    activeRange.value?.start ?? 0,
    textarea.selectionStart,
    textarea.selectionEnd,
  );
  if (!markdownSource) return;

  const html = getSelectedMarkdownHtml(
    props.settings.sourceMode,
    props.modelValue,
    textarea.value,
    activeRange.value?.start ?? 0,
    textarea.selectionStart,
    textarea.selectionEnd,
    props.settings,
    props.filePath,
  );

  try {
    const ClipboardItemCtor = globalThis.ClipboardItem;
    if (ClipboardItemCtor) {
      await navigator.clipboard.write([
        new ClipboardItemCtor({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([markdownSource], { type: "text/plain" }),
        }),
      ]);
      return;
    }
    await navigator.clipboard.writeText(html);
  } catch {
    document.execCommand("copy");
  }
}

async function pastePlainTextFromClipboard() {
  const textarea = ensureTextarea();
  if (!textarea) return;

  try {
    const text = await navigator.clipboard.readText();
    applyTextEdit(
      textarea,
      pastePlainMarkdownText({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      }, text),
    );
  } catch {
    document.execCommand("paste");
  }
}

function duplicateLines() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    duplicateMarkdownLines({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function deleteLines() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    deleteMarkdownLines({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function moveLines(direction: "up" | "down") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    moveMarkdownLines({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, direction),
  );
}

function continueBlock(textarea: HTMLTextAreaElement): boolean {
  const result = continueMarkdownBlock({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, props.settings.indentSize);
  if (!result) return false;
  applyTextEdit(textarea, result);
  return true;
}

function applySpaceShortcut(textarea: HTMLTextAreaElement): boolean {
  const result = applyMarkdownSpaceShortcut({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, props.settings.indentSize);
  if (!result) return false;
  applyTextEdit(textarea, result);
  return true;
}

function toggleCurrentTask() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    toggleTaskAtSelection({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }),
  );
}

function toggleTaskInBlock(blockIndex: number, order: number) {
  const block = blocks.value[blockIndex];
  if (!block) return;
  const nextRaw = toggleMarkdownTaskByOrder(block.raw, order);
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
  applyTextEdit(
    textarea,
    editMarkdownTable({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, kind),
  );
}

function insertTableRow(position: "above" | "below") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownTableRow({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, position),
  );
}

function insertTableColumn(position: "left" | "right") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  applyTextEdit(
    textarea,
    insertMarkdownTableColumn({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    }, position),
  );
}

function moveTableRow(direction: "up" | "down") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = moveMarkdownTableRow({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, direction);
  if (result) {
    applyTextEdit(textarea, result);
  }
}

function moveTableColumn(direction: "left" | "right") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = moveMarkdownTableColumn({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, direction);
  if (result) {
    applyTextEdit(textarea, result);
  }
}

function deleteTable(kind: "row" | "column") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = deleteMarkdownTablePart({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, kind);
  if (result) {
    applyTextEdit(textarea, result);
  }
}

function selectTable(kind: "cell" | "row" | "column" | "table") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = selectMarkdownTablePart({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, kind);
  if (result) {
    setSelection(textarea, result.selectionStart, result.selectionEnd);
  }
}

function deleteWholeTable() {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = deleteMarkdownTable({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  });
  if (result) {
    applyTextEdit(textarea, result);
  }
}

function alignTable(align: "left" | "center" | "right") {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const result = alignMarkdownTable({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, align);
  if (result) {
    applyTextEdit(textarea, result);
  }
}

function setImageWidth(widthPayload?: string) {
  const textarea = ensureTextarea();
  if (!textarea) return;
  const width = widthPayload;
  if (!width) return;

  const result = setImageWidthInLine({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, width);
  if (result) {
    applyTextEdit(textarea, result);
  }
}

function updateEmojiState(textarea: HTMLTextAreaElement, force = false): boolean {
  if (
    props.settings.emojiAutocomplete === "off"
    || (props.settings.emojiAutocomplete === "escape" && !force)
  ) {
    emojiQuery.value = "";
    emojiRange.value = null;
    return false;
  }

  const completion = getEmojiCompletionRange(textarea.value, textarea.selectionStart);
  if (!completion) {
    emojiQuery.value = "";
    emojiRange.value = null;
    return false;
  }

  emojiQuery.value = completion.query;
  emojiRange.value = {
    start: completion.from,
    end: completion.to,
  };
  return true;
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
  if (file) {
    event.preventDefault();
    emit("imageData", {
      name: file.name || `paste-${Date.now()}.png`,
      dataUrl: await fileToDataUrl(file),
    });
    return;
  }

  const textarea = getCurrentTextarea();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (!textarea || (!text && !html)) return;

  const result = pasteMarkdownContent({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, { text, html });
  if (!result) return;

  event.preventDefault();
  applyTextEdit(textarea, result);
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
  const markdownBlock = blocks.value[index];
  if (!Number.isInteger(index) || !markdownBlock) return;
  if (markdownBlock.type === "table") {
    activateTableBlock(index);
  } else if (isRichEditableBlock(markdownBlock)) {
    activateRichBlock(index);
  } else {
    activateBlock(index);
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
  const base = activeRange.value?.start ?? 0;
  emitSelectionFromText(selected, base + textarea.selectionStart, base + textarea.selectionEnd);
}

function emitSelectionFromSource() {
  const textarea = sourceTextareaRef.value;
  if (!textarea) return;
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  emitSelectionFromText(selected, textarea.selectionStart, textarea.selectionEnd);
}

function emitSelectionFromText(selected: string, selectionStart: number, selectionEnd: number) {
  emit("selection", calculateSelectionStats(selected, props.modelValue, selectionEnd, selectionStart, selectionEnd));
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
  textarea.style.height = `${Math.max(28, textarea.scrollHeight + 2)}px`;
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
  --editor-block-margin: 0.8em;
  width: 100%;
  max-width: var(--reading-max-width);
  min-height: 1.4rem;
  margin: var(--editor-block-margin) auto;
  border-radius: 4px;
  transition: background-color 0.14s ease;
}

.editor-block.block-heading {
  --editor-block-margin: 1rem;
}

.editor-block.block-code {
  --editor-block-margin: 15px;
}

.editor-block.block-math,
.editor-block.block-rule {
  --editor-block-margin: 16px;
}

.editor-block.block-footnote {
  --editor-block-margin: 1em;
}

.editor-block.block-frontmatter,
.editor-block.block-reference,
.editor-block.block-abbreviation {
  --editor-block-margin: 0px;
}

.editor-block.is-document-first {
  margin-top: 0;
}

.editor-block.is-document-last {
  margin-bottom: 0;
}

.editor-block.block-table :deep(.visual-table-editor) {
  padding-block: 0;
}

.editor-block:hover:not(.active) {
  background: rgba(59, 130, 246, 0.025);
}

.editor-block.active {
  background: rgba(59, 130, 246, 0.035);
}

.block-source,
.source-editor {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 4px;
  background: transparent;
  box-shadow: none;
  color: var(--text-main);
  font-family: "JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo,
    monospace;
  font-size: var(--editor-font-size);
  line-height: 1.7;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.2rem 0.5rem;
  resize: none;
  tab-size: var(--editor-tab-size, 2);
  white-space: pre-wrap;
  word-break: break-word;
}

:global(:root[data-theme="dark"]) .block-source,
:global(:root[data-theme="dark"]) .source-editor {
  color: var(--text-main);
}

.block-source {
  min-height: 1.7em;
  padding-block: 0;
}

.source-editor {
  min-height: calc(100vh - 140px);
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

.editor-context-menu {
  position: fixed;
  z-index: 85;
  display: grid;
  width: 236px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.context-menu-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.46rem;
  min-height: 30px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.3rem 0.46rem;
  text-align: left;
}

.context-menu-item:hover {
  background: var(--hover);
  color: var(--text);
}

.context-menu-item svg {
  width: 15px;
  height: 15px;
  color: var(--muted);
}

.context-menu-item:hover svg {
  color: var(--text);
}

.context-menu-item span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-menu-item small {
  color: var(--muted);
  font-size: 0.68rem;
  white-space: nowrap;
}

.context-menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0.24rem 0.32rem;
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
