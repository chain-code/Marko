<template>
  <header ref="toolbarRef" class="app-toolbar" @click.stop @keydown.escape="closeMenu">
    <nav class="menu-bar" aria-label="主菜单">
      <div
        v-for="menu in menus"
        :key="menu.key"
        class="menu-root"
        @mouseenter="switchMenu(menu.key)"
      >
        <button
          type="button"
          class="menu-trigger"
          :class="{ active: activeMenu === menu.key }"
          :aria-expanded="activeMenu === menu.key"
          @click="toggleMenu(menu.key)"
        >
          {{ menu.label }}
        </button>

        <div v-if="activeMenu === menu.key" class="menu-panel">
          <template v-for="(item, index) in menu.items" :key="`${menu.key}-${index}`">
            <div v-if="item.type === 'separator'" class="menu-separator" />
            <button
              v-else
              type="button"
              class="menu-item"
              :class="{ active: item.active }"
              :disabled="item.disabled"
              @click="runMenuItem(item)"
            >
              <component :is="item.icon" class="menu-icon" />
              <span class="menu-label">{{ item.label }}</span>
              <span v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</span>
              <Check v-if="item.active" class="menu-check" />
            </button>
          </template>
        </div>
      </div>
    </nav>

    <div class="toolbar-spacer" />

    <div class="quick-status">
      <span v-if="dirty" class="dirty-dot" title="当前文档有未保存修改" />
      <button
        type="button"
        class="quick-toggle"
        :class="{ active: sourceMode }"
        title="源码模式"
        @click="$emit('toggleSource')"
      >
        <Code2 />
      </button>
      <button
        type="button"
        class="quick-toggle"
        :class="{ active: focusMode }"
        title="专注模式"
        @click="$emit('toggleFocus')"
      >
        <Focus />
      </button>
      <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  CheckSquare,
  ClipboardPaste,
  Code,
  Code2,
  Columns3,
  Copy,
  FileDown,
  FilePlus,
  Focus,
  FolderOpen,
  GitBranch,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTree,
  Maximize2,
  MessageSquareWarning,
  Minus,
  Palette,
  Pilcrow,
  Printer,
  Quote,
  Redo2,
  Rows3,
  Save,
  SaveAll,
  Scissors,
  Settings,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TextCursorInput,
  Undo2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from "lucide-vue-next";
import type { EditorCommand, ExportFormat, ThemeName } from "@/types";

type MenuKey = "file" | "edit" | "paragraph" | "format" | "view" | "themes" | "help";

interface MenuAction {
  type?: "action";
  label: string;
  icon: unknown;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

interface MenuSeparator {
  type: "separator";
}

interface MenuGroup {
  key: MenuKey;
  label: string;
  items: MenuItem[];
}

type MenuItem = MenuAction | MenuSeparator;

const props = defineProps<{
  dirty: boolean;
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  zoom: number;
  theme: ThemeName;
}>();

const emit = defineEmits<{
  newFile: [];
  openFile: [];
  openFolder: [];
  save: [];
  saveAs: [];
  command: [command: EditorCommand];
  toggleSource: [];
  toggleFocus: [];
  toggleTypewriter: [];
  zoom: [delta: number];
  fullscreen: [];
  settings: [];
  export: [format: ExportFormat];
  print: [];
  setTheme: [theme: ThemeName];
}>();

const toolbarRef = ref<HTMLElement | null>(null);
const activeMenu = ref<MenuKey | "">("");

const separator: MenuSeparator = { type: "separator" };

const menus = computed<MenuGroup[]>(() => [
  {
    key: "file",
    label: "文件",
    items: [
      action("新建", FilePlus, () => emit("newFile"), "Ctrl+N"),
      action("打开文件...", FolderOpen, () => emit("openFile"), "Ctrl+O"),
      action("打开文件夹...", FolderOpen, () => emit("openFolder")),
      separator,
      action("保存", Save, () => emit("save"), "Ctrl+S"),
      action("另存为...", SaveAll, () => emit("saveAs"), "Ctrl+Shift+S"),
      separator,
      action("导出 PDF...", FileDown, () => emit("export", "pdf")),
      action("导出 Word...", FileDown, () => emit("export", "docx")),
      action("导出 RTF...", FileDown, () => emit("export", "rtf")),
      action("导出 EPUB...", FileDown, () => emit("export", "epub")),
      separator,
      action("打印...", Printer, () => emit("print"), "Ctrl+P"),
      action("偏好设置", Settings, () => emit("settings")),
    ],
  },
  {
    key: "edit",
    label: "编辑",
    items: [
      action("撤销", Undo2, () => emit("command", "undo"), "Ctrl+Z"),
      action("重做", Redo2, () => emit("command", "redo"), "Ctrl+Y"),
      separator,
      action("剪切", Scissors, () => emit("command", "cut"), "Ctrl+X"),
      action("复制", Copy, () => emit("command", "copy"), "Ctrl+C"),
      action("粘贴", ClipboardPaste, () => emit("command", "paste"), "Ctrl+V"),
    ],
  },
  {
    key: "paragraph",
    label: "段落",
    items: [
      action("正文", Pilcrow, () => emit("command", "paragraph")),
      action("一级标题", Heading1, () => emit("command", "heading1")),
      action("二级标题", Heading2, () => emit("command", "heading2")),
      action("三级标题", Heading3, () => emit("command", "heading3")),
      separator,
      action("引用", Quote, () => emit("command", "blockquote")),
      action("无序列表", List, () => emit("command", "bulletList")),
      action("有序列表", ListOrdered, () => emit("command", "orderedList")),
      action("任务列表", CheckSquare, () => emit("command", "taskList")),
      action("切换任务状态", CheckSquare, () => emit("command", "toggleTask")),
      separator,
      action("分割线", Minus, () => emit("command", "hr")),
      action("代码块", Code2, () => emit("command", "codeBlock")),
      action("目录 [TOC]", ListTree, () => emit("command", "toc")),
      action("YAML Front Matter", Code, () => emit("command", "frontmatter")),
      action("Callout / Alert", MessageSquareWarning, () => emit("command", "callout")),
      separator,
      action("插入表格", Table2, () => emit("command", "table")),
      action("添加表格行", Rows3, () => emit("command", "addTableRow")),
      action("添加表格列", Columns3, () => emit("command", "addTableColumn")),
      action("表格左对齐", AlignLeft, () => emit("command", "alignLeft")),
      action("表格居中", AlignCenter, () => emit("command", "alignCenter")),
      action("表格右对齐", AlignRight, () => emit("command", "alignRight")),
      separator,
      action("Mermaid 图表", GitBranch, () => emit("command", "mermaid")),
      action("Flowchart 图表", Workflow, () => emit("command", "flowchart")),
    ],
  },
  {
    key: "format",
    label: "格式",
    items: [
      action("加粗", Bold, () => emit("command", "bold"), "Ctrl+B"),
      action("斜体", Italic, () => emit("command", "italic"), "Ctrl+I"),
      action("删除线", Strikethrough, () => emit("command", "strike")),
      action("行内代码", Code, () => emit("command", "inlineCode")),
      action("链接", Link, () => emit("command", "link"), "Ctrl+K"),
      action("图片", Image, () => emit("command", "image")),
      separator,
      action("高亮", Palette, () => emit("command", "highlight")),
      action("上标", Superscript, () => emit("command", "superscript")),
      action("下标", Subscript, () => emit("command", "subscript")),
    ],
  },
  {
    key: "view",
    label: "视图",
    items: [
      action("源码模式", Code2, () => emit("toggleSource"), undefined, props.sourceMode),
      action("专注模式", Focus, () => emit("toggleFocus"), undefined, props.focusMode),
      action("打字机模式", TextCursorInput, () => emit("toggleTypewriter"), undefined, props.typewriterMode),
      separator,
      action("放大", ZoomIn, () => emit("zoom", 0.05), "Ctrl++"),
      action("缩小", ZoomOut, () => emit("zoom", -0.05), "Ctrl+-"),
      action("全屏", Maximize2, () => emit("fullscreen"), "F11"),
    ],
  },
  {
    key: "themes",
    label: "主题",
    items: [
      action("SoloLog 浅色", Palette, () => emit("setTheme", "solo"), undefined, props.theme === "solo"),
      action("深色", Palette, () => emit("setTheme", "dark"), undefined, props.theme === "dark"),
      separator,
      action("主题与字体设置", Settings, () => emit("settings")),
    ],
  },
  {
    key: "help",
    label: "帮助",
    items: [
      action("关于 Marko", Settings, showAbout),
      action("功能设置", Settings, () => emit("settings")),
    ],
  },
]);

onMounted(() => {
  window.addEventListener("click", closeMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeMenu);
});

function action(
  label: string,
  icon: unknown,
  run: () => void,
  shortcut?: string,
  active = false,
): MenuAction {
  return {
    label,
    icon,
    shortcut,
    active,
    run,
  };
}

function toggleMenu(menu: MenuKey) {
  activeMenu.value = activeMenu.value === menu ? "" : menu;
}

function switchMenu(menu: MenuKey) {
  if (activeMenu.value) {
    activeMenu.value = menu;
  }
}

function closeMenu() {
  activeMenu.value = "";
}

function runMenuItem(item: MenuAction) {
  if (item.disabled) {
    return;
  }

  item.run();
  closeMenu();
}

function showAbout() {
  window.alert("Marko 0.1.0\n一个模拟 Typora 单栏实时预览体验的 Markdown 桌面编辑器。");
}
</script>

<style scoped>
.app-toolbar {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 34px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-subtle);
  padding: 0 0.45rem;
}

.menu-bar {
  display: inline-flex;
  align-items: center;
  gap: 0.12rem;
  min-width: 0;
}

.menu-root {
  position: relative;
}

.menu-trigger {
  height: 28px;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0 0.52rem;
}

.menu-trigger:hover,
.menu-trigger.active {
  background: var(--hover);
  color: var(--text);
}

.menu-panel {
  position: absolute;
  top: calc(100% + 0.18rem);
  left: 0;
  z-index: 70;
  display: grid;
  min-width: 238px;
  max-height: min(70vh, 680px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.menu-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 0.5rem;
  min-height: 30px;
  width: 100%;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  padding: 0.32rem 0.5rem;
  text-align: left;
}

.menu-item:hover,
.menu-item.active {
  background: var(--hover);
  color: var(--text);
}

.menu-item:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.menu-icon,
.menu-check {
  width: 16px;
  height: 16px;
}

.menu-icon {
  color: var(--muted);
}

.menu-item:hover .menu-icon,
.menu-item.active .menu-icon {
  color: var(--text);
}

.menu-label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-shortcut {
  color: var(--muted);
  font-size: 0.72rem;
  white-space: nowrap;
}

.menu-check {
  color: var(--accent-strong);
}

.menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0.28rem 0.3rem;
}

.toolbar-spacer {
  flex: 1 1 auto;
}

.quick-status {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  min-width: 0;
}

.dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--warning);
}

.quick-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.quick-toggle:hover,
.quick-toggle.active {
  background: var(--hover);
  color: var(--text);
}

.quick-toggle svg {
  width: 16px;
  height: 16px;
}

.zoom-label {
  min-width: 42px;
  color: var(--muted);
  font-size: 0.78rem;
  text-align: right;
}

@media (max-width: 860px) {
  .app-toolbar {
    overflow-x: auto;
  }

  .menu-bar {
    flex: 0 0 auto;
  }
}

@media print {
  .app-toolbar {
    display: none;
  }
}
</style>
