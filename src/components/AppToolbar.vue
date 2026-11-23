<template>
  <header ref="toolbarRef" class="app-toolbar" @click.stop>
    <nav class="menu-bar" role="menubar" aria-label="主菜单" @keydown="handleMenuBarKeydown">
      <div
        v-for="(menu, menuIndex) in menus"
        :key="menu.key"
        class="menu-root"
        @mouseenter="switchMenu(menu.key)"
      >
        <button
          :id="menuTriggerId(menu.key)"
          type="button"
          class="menu-trigger"
          :class="{ active: activeMenu === menu.key }"
          role="menuitem"
          aria-haspopup="menu"
          :aria-expanded="activeMenu === menu.key"
          :aria-controls="menuPanelId(menu.key)"
          :tabindex="focusedMenu === menu.key ? 0 : -1"
          :data-menu-key="menu.key"
          :data-menu-index="menuIndex"
          data-menu-trigger
          @focus="focusedMenu = menu.key"
          @pointerdown="rememberFocusBeforeMenu"
          @click="toggleMenu(menu.key)"
        >
          {{ menu.label }}
        </button>

        <div
          v-if="activeMenu === menu.key"
          :id="menuPanelId(menu.key)"
          class="menu-panel"
          role="menu"
          :aria-labelledby="menuTriggerId(menu.key)"
        >
          <template v-for="(item, index) in menu.items" :key="`${menu.key}-${index}`">
            <div v-if="item.type === 'separator'" class="menu-separator" role="separator" />
            <div
              v-else-if="item.type === 'submenu'"
              class="menu-submenu"
              @mouseenter="openSubmenu(index, false, $event)"
            >
              <button
                :id="submenuTriggerId(menu.key, index)"
                type="button"
                class="menu-item submenu-trigger"
                :class="{ active: item.active }"
                :disabled="item.disabled"
                role="menuitem"
                aria-haspopup="menu"
                :aria-expanded="activeSubmenu === index"
                :aria-controls="submenuPanelId(menu.key, index)"
                tabindex="-1"
                data-menu-level="root"
                :data-menu-index="index"
                @click="openSubmenu(index, true, $event)"
              >
                <component :is="item.icon" class="menu-icon" />
                <span class="menu-label">{{ item.label }}</span>
                <span class="menu-shortcut" />
                <ChevronRight class="menu-arrow" />
              </button>
              <div
                v-if="activeSubmenu === index"
                :id="submenuPanelId(menu.key, index)"
                class="submenu-panel" :style="submenuPanelStyle"
                role="menu"
                :aria-labelledby="submenuTriggerId(menu.key, index)"
              >
                <template v-for="(child, childIndex) in item.items" :key="`${menu.key}-${index}-${childIndex}`">
                  <div v-if="child.type === 'separator'" class="menu-separator" role="separator" />
                  <button
                    v-else
                    type="button"
                    class="menu-item"
                    :class="{ active: child.active }"
                    :disabled="child.disabled"
                    :title="child.title"
                    role="menuitem"
                    tabindex="-1"
                    data-menu-level="submenu"
                    :data-menu-index="childIndex"
                    @click="runMenuItem(child)"
                  >
                    <component :is="child.icon" class="menu-icon" />
                    <span class="menu-label">{{ child.label }}</span>
                    <span v-if="child.shortcut" class="menu-shortcut">{{ child.shortcut }}</span>
                    <Check v-if="child.active" class="menu-check" />
                  </button>
                </template>
              </div>
            </div>
            <button
              v-else
              type="button"
              class="menu-item"
              :class="{ active: item.active }"
              :disabled="item.disabled"
              :title="item.title"
              role="menuitem"
              tabindex="-1"
              data-menu-level="root"
              :data-menu-index="index"
              @mouseenter="closeSubmenu"
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
  </header>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  CheckSquare,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Code,
  Code2,
  Columns3,
  Copy,
  CornerDownLeft,
  CornerUpLeft,
  FileDown,
  FilePlus,
  FileText,
  FileX,
  Focus,
  FolderOpen,
  Heading,
  GitBranch,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image,
  IndentDecrease,
  IndentIncrease,
  Info,
  Italic,
  Lightbulb,
  LocateFixed,
  Link,
  List,
  ListOrdered,
  ListTree,
  Maximize2,
  MessageSquareWarning,
  MessageSquareCode,
  Minus,
  NotebookText,
  OctagonAlert,
  Palette,
  PanelLeft,
  PencilLine,
  Pilcrow,
  Printer,
  Quote,
  Redo2,
  RemoveFormatting,
  Replace,
  RotateCcw,
  Rows3,
  Save,
  SaveAll,
  Scissors,
  Search,
  Settings,
  Sigma,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TextCursorInput,
  TriangleAlert,
  Trash2,
  Trash,
  Underline,
  Undo2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from "lucide-vue-next";
import type { EditorCommand, ExportFormat, FilePanelMode, RecentFile, SidebarTab, ThemeName } from "@/types";
import {
  findAdjacentMenuItemIndex,
  findBoundaryMenuItemIndex,
  isMenuActivationKey,
  wrapMenuIndex,
} from "@/utils/menuNavigation";

type MenuKey = "file" | "edit" | "paragraph" | "format" | "view" | "themes" | "help";

interface MenuAction {
  type?: "action";
  label: string;
  icon: unknown;
  shortcut?: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

interface MenuSeparator {
  type: "separator";
}

interface MenuSubmenu {
  type: "submenu";
  label: string;
  icon: unknown;
  active?: boolean;
  disabled?: boolean;
  items: ChildMenuItem[];
}

interface MenuGroup {
  key: MenuKey;
  label: string;
  items: MenuItem[];
}

type ChildMenuItem = MenuAction | MenuSeparator;
type MenuItem = ChildMenuItem | MenuSubmenu;

const props = defineProps<{
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  sidebarVisible: boolean;
  sidebarActiveTab: SidebarTab;
  filePanelMode: FilePanelMode;
  hasLocalFile: boolean;
  hasWorkspace: boolean;
  theme: ThemeName;
  spellcheck: boolean;
  statusBarVisible: boolean;
  recentFiles: RecentFile[];
}>();

const emit = defineEmits<{
  newFile: [];
  openFile: [];
  openFolder: [];
  openCurrentFolderWorkspace: [];
  closeWorkspaceFolder: [];
  refreshWorkspaceFolder: [];
  quickOpen: [];
  closeFile: [];
  reloadFile: [];
  copyFilePath: [];
  revealFile: [];
  openContainingFolder: [];
  showRecentFiles: [];
  openRecentFile: [path: string];
  clearRecentFiles: [];
  save: [];
  saveAs: [];
  renameFile: [];
  insertImageFile: [];
  command: [command: EditorCommand, payload?: string];
  find: [];
  findNext: [];
  findPrevious: [];
  replace: [];
  jumpToSelection: [];
  locateCurrentFile: [];
  toggleSidebar: [];
  showSidebarTab: [tab: SidebarTab];
  showFileView: [mode: FilePanelMode];
  globalSearch: [];
  toggleSource: [];
  toggleFocus: [];
  toggleTypewriter: [];
  toggleSpellcheck: [];
  toggleStatusBar: [];
  showWordCount: [];
  zoom: [delta: number];
  resetZoom: [];
  fullscreen: [];
  settings: [];
  export: [format: ExportFormat];
  print: [];
  setTheme: [theme: ThemeName];
  showAbout: [];
}>();

const toolbarRef = ref<HTMLElement | null>(null);
const activeMenu = ref<MenuKey | "">("");
const focusedMenu = ref<MenuKey>("file");
const activeSubmenu = ref<number | null>(null);
const focusBeforeMenu = ref<HTMLElement | null>(null);
const submenuPosition = ref({ x: 0, y: 0 });
const submenuPanelStyle = computed(() => ({
  left: `${submenuPosition.value.x}px`,
  top: `${submenuPosition.value.y}px`,
}));

const separator: MenuSeparator = { type: "separator" };

const menus = computed<MenuGroup[]>(() => [
  {
    key: "file",
    label: "文件",
    items: [
      action("新建", FilePlus, () => emit("newFile"), "Ctrl+N"),
      action("打开文件...", FolderOpen, () => emit("openFile"), "Ctrl+O"),
      action("打开文件夹...", FolderOpen, () => emit("openFolder")),
      action("快速打开...", Search, () => emit("quickOpen"), "Ctrl+P"),
      submenu("打开最近", NotebookText, [
        ...(props.recentFiles.length > 0
          ? props.recentFiles.slice(0, 10).map(recentFileAction)
          : [action("暂无最近文件", FileText, () => undefined, undefined, false, true)]),
        separator,
        action("显示最近文件...", NotebookText, () => emit("showRecentFiles")),
        action("清空最近文件", Trash2, () => emit("clearRecentFiles")),
      ]),
      separator,
      action("重新载入", RotateCcw, () => emit("reloadFile"), "Ctrl+R", false, !props.hasLocalFile),
      separator,
      action("保存", Save, () => emit("save"), "Ctrl+S"),
      action("另存为...", SaveAll, () => emit("saveAs"), "Ctrl+Shift+S"),
      separator,
      submenu("导出", FileDown, [
        action("PDF...", FileDown, () => emit("export", "pdf")),
        action("HTML...", FileDown, () => emit("export", "html")),
        action("Word...", FileDown, () => emit("export", "docx")),
        action("RTF...", FileDown, () => emit("export", "rtf")),
        action("EPUB...", FileDown, () => emit("export", "epub")),
      ]),
      action("打印...", Printer, () => emit("print"), "Shift+Alt+P"),
      separator,
      submenu("工作区", FolderOpen, [
        action("打开所在文件夹为工作区", FolderOpen, () => emit("openCurrentFolderWorkspace"), undefined, false, !props.hasLocalFile),
        action("刷新工作区文件夹", RotateCcw, () => emit("refreshWorkspaceFolder"), undefined, false, !props.hasWorkspace),
        action("关闭工作区文件夹", FileX, () => emit("closeWorkspaceFolder"), undefined, false, !props.hasWorkspace),
      ]),
      submenu("文件操作", FileText, [
        action("重命名文件...", PencilLine, () => emit("renameFile"), undefined, false, !props.hasLocalFile),
        action("复制文件路径", Copy, () => emit("copyFilePath"), undefined, false, !props.hasLocalFile),
        action("在资源管理器中显示", FolderOpen, () => emit("revealFile"), undefined, false, !props.hasLocalFile),
        action("打开所在文件夹", FolderOpen, () => emit("openContainingFolder"), undefined, false, !props.hasLocalFile),
      ]),
      separator,
      action("偏好设置...", Settings, () => emit("settings"), "Ctrl+,"),
      action("关闭文件", FileX, () => emit("closeFile"), "Ctrl+W"),
    ],
  },
  {
    key: "edit",
    label: "编辑",
    items: [
      action("撤销", Undo2, () => emit("command", "undo"), "Ctrl+Z"),
      action("重做", Redo2, () => emit("command", "redo"), "Ctrl+Y / Ctrl+Shift+Z"),
      separator,
      action("剪切", Scissors, () => emit("command", "cut"), "Ctrl+X"),
      action("复制", Copy, () => emit("command", "copy"), "Ctrl+C"),
      action("粘贴", ClipboardPaste, () => emit("command", "paste"), "Ctrl+V"),
      action("粘贴为纯文本", ClipboardPaste, () => emit("command", "pastePlainText"), "Ctrl+Shift+V"),
      submenu("复制为", Copy, [
        action("Markdown", Copy, () => emit("command", "copyMarkdown"), "Ctrl+Shift+C"),
        action("HTML", Copy, () => emit("command", "copyHtml")),
        action("纯文本", Copy, () => emit("command", "copyPlainText")),
      ]),
      separator,
      action("全选", List, () => emit("command", "selectAll"), "Ctrl+A"),
      submenu("选择", List, [
        action("当前词", List, () => emit("command", "selectWord"), "Ctrl+D"),
        action("样式范围", List, () => emit("command", "selectStyleScope"), "Ctrl+E"),
        action("当前句子", List, () => emit("command", "selectSentence")),
        action("当前行", List, () => emit("command", "selectLine"), "Ctrl+L"),
        action("当前段落", Pilcrow, () => emit("command", "selectParagraph")),
      ]),
      submenu("删除", Trash, [
        action("当前词", Trash, () => emit("command", "deleteWord"), "Ctrl+Shift+D"),
        action("当前句子", Trash, () => emit("command", "deleteSentence")),
        action("样式范围", Trash, () => emit("command", "deleteStyleScope")),
        action("当前段落", Trash, () => emit("command", "deleteParagraph")),
      ]),
      submenu("行操作", List, [
        action("复制当前行", Copy, () => emit("command", "duplicateLine")),
        action("删除当前行", Trash, () => emit("command", "deleteLine"), "Ctrl+Shift+Backspace"),
        action("上移当前行", ArrowUp, () => emit("command", "moveLineUp"), "Alt+↑"),
        action("下移当前行", ArrowDown, () => emit("command", "moveLineDown"), "Alt+↓"),
      ]),
      action("拼写检查", CheckSquare, () => emit("toggleSpellcheck"), undefined, props.spellcheck),
      separator,
      submenu("跳转到", LocateFixed, [
        action("文档开头", CornerUpLeft, () => emit("command", "goToDocumentStart"), "Ctrl+Home"),
        action("选区", LocateFixed, () => emit("jumpToSelection"), "Ctrl+J"),
        action("文档末尾", CornerDownLeft, () => emit("command", "goToDocumentEnd"), "Ctrl+End"),
      ]),
      separator,
      action("查找", Search, () => emit("find"), "Ctrl+F"),
      action("查找下一个", Search, () => emit("findNext"), "F3 / Ctrl+G"),
      action("查找上一个", Search, () => emit("findPrevious"), "Shift+F3 / Ctrl+Shift+G"),
      action("替换", Replace, () => emit("replace"), "Ctrl+H"),
    ],
  },
  {
    key: "paragraph",
    label: "段落",
    items: [
      action("正文", Pilcrow, () => emit("command", "paragraph"), "Ctrl+0"),
      action("一级标题", Heading1, () => emit("command", "heading1"), "Ctrl+1"),
      action("二级标题", Heading2, () => emit("command", "heading2"), "Ctrl+2"),
      action("三级标题", Heading3, () => emit("command", "heading3"), "Ctrl+3"),
      action("四级标题", Heading4, () => emit("command", "heading4"), "Ctrl+4"),
      action("五级标题", Heading5, () => emit("command", "heading5"), "Ctrl+5"),
      action("六级标题", Heading6, () => emit("command", "heading6"), "Ctrl+6"),
      action("提升标题级别", Heading, () => emit("command", "increaseHeading"), "Ctrl+="),
      action("降低标题级别", Heading, () => emit("command", "decreaseHeading"), "Ctrl+-"),
      separator,
      submenu("表格", Table2, [
        action("插入表格", Table2, () => emit("command", "table"), "Ctrl+T"),
        separator,
        action("在上方插入行", Rows3, () => emit("command", "addTableRowAbove")),
        action("在下方插入行", Rows3, () => emit("command", "addTableRowBelow"), "Ctrl+Enter"),
        action("上移表格行", ArrowUp, () => emit("command", "moveTableRowUp"), "Alt+↑"),
        action("下移表格行", ArrowDown, () => emit("command", "moveTableRowDown"), "Alt+↓"),
        action("删除表格行", Trash2, () => emit("command", "deleteTableRow"), "Ctrl+Shift+Backspace"),
        separator,
        action("在左侧插入列", Columns3, () => emit("command", "addTableColumnLeft")),
        action("在右侧插入列", Columns3, () => emit("command", "addTableColumnRight")),
        action("左移表格列", ArrowUp, () => emit("command", "moveTableColumnLeft"), "Alt+←"),
        action("右移表格列", ArrowDown, () => emit("command", "moveTableColumnRight"), "Alt+→"),
        action("删除表格列", Trash2, () => emit("command", "deleteTableColumn")),
        separator,
        action("选择表格单元格", Table2, () => emit("command", "selectTableCell")),
        action("选择表格行", Rows3, () => emit("command", "selectTableRow")),
        action("选择表格列", Columns3, () => emit("command", "selectTableColumn")),
        action("选择表格", Table2, () => emit("command", "selectTable")),
        action("删除表格", Trash2, () => emit("command", "deleteTable")),
        separator,
        action("表格左对齐", AlignLeft, () => emit("command", "alignLeft")),
        action("表格居中", AlignCenter, () => emit("command", "alignCenter")),
        action("表格右对齐", AlignRight, () => emit("command", "alignRight")),
      ]),
      action("代码块", Code2, () => emit("command", "codeBlock"), "Ctrl+Shift+K"),
      action("数学公式块", Sigma, () => emit("command", "mathBlock"), "Ctrl+Shift+M"),
      separator,
      action("引用", Quote, () => emit("command", "blockquote"), "Ctrl+Shift+Q"),
      action("无序列表", List, () => emit("command", "bulletList"), "Ctrl+Shift+]"),
      action("有序列表", ListOrdered, () => emit("command", "orderedList"), "Ctrl+Shift+["),
      action("任务列表", CheckSquare, () => emit("command", "taskList"), "Ctrl+Shift+X"),
      action("定义列表", List, () => emit("command", "definitionList")),
      action("切换任务状态", CheckSquare, () => emit("command", "toggleTask")),
      action("增加列表缩进", IndentIncrease, () => emit("command", "indent"), "Ctrl+]"),
      action("减少列表缩进", IndentDecrease, () => emit("command", "outdent"), "Ctrl+["),
      separator,
      action("脚注", NotebookText, () => emit("command", "footnote")),
      action("分割线", Minus, () => emit("command", "hr")),
      action("目录 [TOC]", ListTree, () => emit("command", "toc")),
      action("YAML Front Matter", Code, () => emit("command", "frontmatter")),
      submenu("Callout / Alert", MessageSquareWarning, [
        action("Note", Info, () => emit("command", "callout", "NOTE")),
        action("Tip", Lightbulb, () => emit("command", "callout", "TIP")),
        action("Important", CircleAlert, () => emit("command", "callout", "IMPORTANT")),
        action("Warning", TriangleAlert, () => emit("command", "callout", "WARNING")),
        action("Caution", OctagonAlert, () => emit("command", "callout", "CAUTION")),
      ]),
      separator,
      submenu("图表", GitBranch, [
        action("Mermaid 图表", GitBranch, () => emit("command", "mermaid")),
        action("Flowchart 图表", Workflow, () => emit("command", "flowchart")),
        action("Sequence 时序图", Workflow, () => emit("command", "sequence")),
      ]),
    ],
  },
  {
    key: "format",
    label: "格式",
    items: [
      action("加粗", Bold, () => emit("command", "bold"), "Ctrl+B"),
      action("斜体", Italic, () => emit("command", "italic"), "Ctrl+I"),
      action("下划线", Underline, () => emit("command", "underline"), "Ctrl+U"),
      action("删除线", Strikethrough, () => emit("command", "strike"), "Alt+Shift+5"),
      action("行内代码", Code, () => emit("command", "inlineCode"), "Ctrl+Shift+`"),
      action("行内公式", Sigma, () => emit("command", "inlineMath")),
      separator,
      action("链接", Link, () => emit("command", "link"), "Ctrl+K"),
      action("打开链接", Link, () => emit("command", "openLink"), "Ctrl+Shift+O"),
      submenu("图片", Image, [
        action("插入图片", Image, () => emit("command", "image"), "Ctrl+Shift+I"),
        action("插入本地图片...", Image, () => emit("insertImageFile")),
        action("设置图片宽度...", Image, () => emit("command", "setImageWidth")),
      ]),
      separator,
      action("高亮", Palette, () => emit("command", "highlight")),
      action("上标", Superscript, () => emit("command", "superscript")),
      action("下标", Subscript, () => emit("command", "subscript")),
      action("注释", MessageSquareCode, () => emit("command", "comment"), "Ctrl+Shift+/"),
      separator,
      action("清除格式", RemoveFormatting, () => emit("command", "clearFormat"), "Ctrl+\\"),
    ],
  },
  {
    key: "view",
    label: "视图",
    items: [
      action("源码模式", Code2, () => emit("toggleSource"), "Ctrl+/", props.sourceMode),
      action("专注模式", Focus, () => emit("toggleFocus"), "F8", props.focusMode),
      action("打字机模式", TextCursorInput, () => emit("toggleTypewriter"), "F9", props.typewriterMode),
      separator,
      action("显示侧边栏", PanelLeft, () => emit("toggleSidebar"), "Ctrl+Shift+L", props.sidebarVisible),
      action("大纲", FileText, () => emit("showSidebarTab", "outline"), "Ctrl+Shift+1", props.sidebarVisible && props.sidebarActiveTab === "outline"),
      action("文档列表", List, () => emit("showFileView", "list"), "Ctrl+Shift+2", props.sidebarVisible && props.sidebarActiveTab === "files" && props.filePanelMode === "list"),
      action("文件树", ListTree, () => emit("showFileView", "tree"), "Ctrl+Shift+3", props.sidebarVisible && props.sidebarActiveTab === "files" && props.filePanelMode === "tree"),
      action("在文件树中定位", LocateFixed, () => emit("locateCurrentFile"), undefined, false, !props.hasLocalFile),
      action("全局搜索...", Search, () => emit("globalSearch"), "Ctrl+Shift+F"),
      separator,
      action("显示状态栏", PanelLeft, () => emit("toggleStatusBar"), undefined, props.statusBarVisible),
      action("字数统计...", NotebookText, () => emit("showWordCount")),
      separator,
      action("实际大小", RotateCcw, () => emit("resetZoom"), "Ctrl+Shift+0"),
      action("放大", ZoomIn, () => emit("zoom", 0.05), "Ctrl+Shift+="),
      action("缩小", ZoomOut, () => emit("zoom", -0.05), "Ctrl+Shift+-"),
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
  window.addEventListener("click", handleOutsideClick);
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("click", handleOutsideClick);
  window.removeEventListener("keydown", handleWindowKeydown);
});

function action(
  label: string,
  icon: unknown,
  run: () => void,
  shortcut?: string,
  active = false,
  disabled = false,
): MenuAction {
  return {
    label,
    icon,
    shortcut,
    active,
    disabled,
    run,
  };
}

function recentFileAction(file: RecentFile): MenuAction {
  return {
    label: file.name,
    title: file.path,
    icon: FileText,
    run: () => emit("openRecentFile", file.path),
  };
}

function submenu(
  label: string,
  icon: unknown,
  items: ChildMenuItem[],
  active = false,
  disabled = false,
): MenuSubmenu {
  return {
    type: "submenu",
    label,
    icon,
    items,
    active,
    disabled,
  };
}

function menuTriggerId(menu: MenuKey) {
  return `app-menu-trigger-${menu}`;
}

function menuPanelId(menu: MenuKey) {
  return `app-menu-panel-${menu}`;
}

function submenuTriggerId(menu: MenuKey, index: number) {
  return `app-menu-submenu-trigger-${menu}-${index}`;
}

function submenuPanelId(menu: MenuKey, index: number) {
  return `app-menu-submenu-panel-${menu}-${index}`;
}

function rememberFocusBeforeMenu() {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && !toolbarRef.value?.contains(focused)) {
    focusBeforeMenu.value = focused;
  }
}

async function toggleMenu(menu: MenuKey) {
  focusedMenu.value = menu;
  if (activeMenu.value === menu) {
    closeMenu();
    return;
  }

  await openMenu(menu, "first");
}

function switchMenu(menu: MenuKey) {
  if (activeMenu.value && activeMenu.value !== menu) {
    const keepKeyboardFocus = document.activeElement instanceof HTMLElement
      && Boolean(toolbarRef.value?.contains(document.activeElement));
    activeMenu.value = menu;
    focusedMenu.value = menu;
    activeSubmenu.value = null;
    if (keepKeyboardFocus) {
      nextTick(() => focusRootBoundary(menu, "first"));
    }
  }
}

function closeMenu() {
  activeMenu.value = "";
  activeSubmenu.value = null;
}

function closeSubmenu() {
  activeSubmenu.value = null;
}

async function openMenu(menu: MenuKey, boundary: "first" | "last") {
  activeMenu.value = menu;
  focusedMenu.value = menu;
  activeSubmenu.value = null;
  await nextTick();
  focusRootBoundary(menu, boundary);
}

async function openSubmenu(index: number, focusFirst: boolean, event: MouseEvent) {
  const currentTarget = event.currentTarget as HTMLElement;
  const trigger = currentTarget.matches("button")
    ? currentTarget
    : currentTarget.querySelector<HTMLElement>(".submenu-trigger");
  if (!trigger || (trigger as HTMLButtonElement).disabled) return;

  positionSubmenu(trigger);
  activeSubmenu.value = index;
  if (focusFirst) {
    await nextTick();
    focusSubmenuBoundary(index, "first");
  }
}

function positionSubmenu(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const submenuWidth = 238;
  const gap = 3;
  const margin = 8;
  const opensLeft = rect.right + gap + submenuWidth > window.innerWidth - margin;
  const x = opensLeft
    ? Math.max(margin, rect.left - submenuWidth - gap)
    : Math.min(rect.right + gap, window.innerWidth - submenuWidth - margin);
  const y = Math.min(Math.max(margin, rect.top - 4), window.innerHeight - 48);
  submenuPosition.value = { x, y };
}

function handleOutsideClick() {
  closeMenu();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (document.querySelector('[aria-modal="true"]')) return;
  const opensMenubar = (
    event.key === "F10"
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.altKey
  ) || (
    event.key === "Alt"
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
  );
  if (!opensMenubar || event.repeat) return;

  event.preventDefault();
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && toolbarRef.value?.contains(focused)) {
    closeMenu();
    restoreFocusBeforeMenu();
    return;
  }

  rememberFocusBeforeMenu();
  closeMenu();
  nextTick(() => focusMenuTrigger(focusedMenu.value));
}

function handleMenuBarKeydown(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  if (target.hasAttribute("data-menu-trigger")) {
    handleTopLevelKeydown(event, target);
    return;
  }

  const level = target.dataset.menuLevel;
  if (level === "root") {
    handleRootMenuKeydown(event, target);
  } else if (level === "submenu") {
    handleSubmenuKeydown(event, target);
  }
}

function handleTopLevelKeydown(event: KeyboardEvent, target: HTMLButtonElement) {
  const menu = target.dataset.menuKey as MenuKey;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    void moveTopLevelMenu(menu, event.key === "ArrowRight" ? 1 : -1, Boolean(activeMenu.value));
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp" || isMenuActivationKey(event.key)) {
    event.preventDefault();
    void openMenu(menu, event.key === "ArrowUp" ? "last" : "first");
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    if (activeMenu.value) {
      closeMenu();
      focusMenuTrigger(menu);
    } else {
      restoreFocusBeforeMenu();
    }
  }
}

function handleRootMenuKeydown(event: KeyboardEvent, target: HTMLButtonElement) {
  const menu = getActiveMenu();
  if (!menu) return;
  const itemIndex = Number(target.dataset.menuIndex);

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    closeSubmenu();
    const nextIndex = findAdjacentMenuItemIndex(menu.items, itemIndex, event.key === "ArrowDown" ? 1 : -1);
    focusRootItem(menu.key, nextIndex);
    return;
  }

  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    closeSubmenu();
    focusRootBoundary(menu.key, event.key === "Home" ? "first" : "last");
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    const item = menu.items[itemIndex];
    if (item?.type === "submenu") {
      void openSubmenuFromKeyboard(menu.key, itemIndex, target);
    } else {
      void moveTopLevelMenu(menu.key, 1, true);
    }
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    void moveTopLevelMenu(menu.key, -1, true);
    return;
  }

  if (isMenuActivationKey(event.key)) {
    event.preventDefault();
    target.click();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    if (activeSubmenu.value !== null) {
      closeSubmenu();
      target.focus();
    } else {
      closeMenu();
      focusMenuTrigger(menu.key);
    }
    return;
  }

  if (event.key === "Tab") {
    closeMenu();
  }
}

function handleSubmenuKeydown(event: KeyboardEvent, target: HTMLButtonElement) {
  const menu = getActiveMenu();
  const parentIndex = activeSubmenu.value;
  if (!menu || parentIndex === null) return;
  const parent = menu.items[parentIndex];
  if (!parent || parent.type !== "submenu") return;
  const childIndex = Number(target.dataset.menuIndex);

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const nextIndex = findAdjacentMenuItemIndex(parent.items, childIndex, event.key === "ArrowDown" ? 1 : -1);
    focusSubmenuItem(menu.key, parentIndex, nextIndex);
    return;
  }

  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    focusSubmenuBoundary(parentIndex, event.key === "Home" ? "first" : "last");
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "Escape") {
    event.preventDefault();
    closeSubmenu();
    focusRootItem(menu.key, parentIndex);
    return;
  }

  if (isMenuActivationKey(event.key)) {
    event.preventDefault();
    target.click();
    return;
  }

  if (event.key === "Tab") {
    closeMenu();
  }
}

async function moveTopLevelMenu(menu: MenuKey, direction: -1 | 1, open: boolean) {
  const currentIndex = menus.value.findIndex((item) => item.key === menu);
  const nextIndex = wrapMenuIndex(currentIndex, menus.value.length, direction);
  const nextMenu = menus.value[nextIndex];
  if (!nextMenu) return;

  focusedMenu.value = nextMenu.key;
  if (open) {
    await openMenu(nextMenu.key, "first");
  } else {
    focusMenuTrigger(nextMenu.key);
  }
}

async function openSubmenuFromKeyboard(menu: MenuKey, index: number, trigger: HTMLElement) {
  positionSubmenu(trigger);
  activeSubmenu.value = index;
  await nextTick();
  focusSubmenuBoundary(index, "first");
}

function getActiveMenu() {
  return menus.value.find((menu) => menu.key === activeMenu.value);
}

function focusMenuTrigger(menu: MenuKey) {
  focusedMenu.value = menu;
  toolbarRef.value?.querySelector<HTMLButtonElement>(`#${menuTriggerId(menu)}`)?.focus();
}

function focusRootBoundary(menu: MenuKey, boundary: "first" | "last") {
  const group = menus.value.find((item) => item.key === menu);
  if (!group) return;
  focusRootItem(menu, findBoundaryMenuItemIndex(group.items, boundary));
}

function focusRootItem(menu: MenuKey, index: number) {
  if (index < 0) return;
  const item = toolbarRef.value?.querySelector<HTMLButtonElement>(
    `#${menuPanelId(menu)} [data-menu-level="root"][data-menu-index="${index}"]`,
  );
  focusMenuItem(item);
}

function focusSubmenuBoundary(parentIndex: number, boundary: "first" | "last") {
  const menu = getActiveMenu();
  if (!menu) return;
  const parent = menu.items[parentIndex];
  if (!parent || parent.type !== "submenu") return;
  focusSubmenuItem(menu.key, parentIndex, findBoundaryMenuItemIndex(parent.items, boundary));
}

function focusSubmenuItem(menu: MenuKey, parentIndex: number, childIndex: number) {
  if (childIndex < 0) return;
  const item = toolbarRef.value?.querySelector<HTMLButtonElement>(
    `#${submenuPanelId(menu, parentIndex)} [data-menu-level="submenu"][data-menu-index="${childIndex}"]`,
  );
  focusMenuItem(item);
}

function focusMenuItem(item: HTMLButtonElement | null | undefined) {
  item?.focus();
  item?.scrollIntoView({ block: "nearest" });
}

function restoreFocusBeforeMenu() {
  closeMenu();
  focusBeforeMenu.value?.focus();
  focusBeforeMenu.value = null;
}

function runMenuItem(item: MenuAction) {
  if (item.disabled) {
    return;
  }

  item.run();
  restoreFocusBeforeMenu();
}

function showAbout() {
  emit("showAbout");
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
.menu-trigger.active,
.menu-trigger:focus-visible {
  background: var(--hover);
  color: var(--text);
}

.menu-panel,
.submenu-panel {
  display: grid;
  min-width: 238px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 0.18rem);
  left: 0;
  z-index: 70;
  max-height: min(70vh, 680px);
  overflow-x: hidden;
  overflow-y: auto;
}

.menu-submenu {
  position: relative;
}

.submenu-panel {
  position: fixed;
  z-index: 71;
  max-height: calc(100vh - 1rem);
  overflow: auto;
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
.menu-item.active,
.menu-item:focus-visible {
  background: var(--hover);
  color: var(--text);
}

.menu-trigger:focus-visible,
.menu-item:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--accent-strong) 65%, transparent);
  outline-offset: -1px;
}

.menu-item:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.menu-icon,
.menu-check,
.menu-arrow {
  width: 16px;
  height: 16px;
}

.menu-icon {
  color: var(--muted);
}

.menu-item:hover .menu-icon,
.menu-item.active .menu-icon,
.menu-item:focus-visible .menu-icon {
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

.menu-arrow {
  color: var(--muted);
}

.submenu-trigger:hover .menu-arrow,
.submenu-trigger.active .menu-arrow {
  color: var(--text);
}

.menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0.28rem 0.3rem;
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
