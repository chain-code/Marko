import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const toolbarSource = readFileSync(resolve("src/components/AppToolbar.vue"), "utf8");

test("AppToolbar renders second-level menu panels like Typora", () => {
  assert.match(toolbarSource, /interface MenuSubmenu/);
  assert.match(toolbarSource, /function submenu\(/);
  assert.match(toolbarSource, /class="menu-item submenu-trigger"/);
  assert.match(toolbarSource, /class="submenu-panel"/);
  assert.match(toolbarSource, /ChevronRight class="menu-arrow"/);
});

test("File menu keeps recent files and export actions inside submenus", () => {
  assert.match(toolbarSource, /submenu\("打开最近",\s*NotebookText,\s*\[[\s\S]*action\("显示最近文件\.\.\.",\s*NotebookText,\s*\(\) => emit\("showRecentFiles"\)\)[\s\S]*action\("清空最近文件",\s*Trash2,\s*\(\) => emit\("clearRecentFiles"\)\)/);
  assert.match(toolbarSource, /submenu\("导出",\s*FileDown,\s*\[[\s\S]*action\("PDF\.\.\.",\s*FileDown,\s*\(\) => emit\("export", "pdf"\)\)[\s\S]*action\("HTML\.\.\.",\s*FileDown,\s*\(\) => emit\("export", "html"\)\)[\s\S]*action\("Word\.\.\.",\s*FileDown,\s*\(\) => emit\("export", "docx"\)\)/);
  assert.doesNotMatch(toolbarSource, /action\("导出 PDF|action\("导出 HTML|action\("导出 Word|action\("导出 RTF|action\("导出 EPUB/);
});

test("Typora-compatible menus keep only genuine nested groups in submenus", () => {
  assert.match(toolbarSource, /submenu\("跳转到",\s*LocateFixed,\s*\[[\s\S]*action\("文档开头"[\s\S]*action\("选区"[\s\S]*action\("文档末尾"/);
  assert.match(toolbarSource, /submenu\("表格",\s*Table2,\s*\[[\s\S]*action\("插入表格"[\s\S]*action\("删除表格"[\s\S]*action\("表格右对齐"/);
  assert.doesNotMatch(toolbarSource, /submenu\("标题"|submenu\("侧边栏"|submenu\("缩放"/);
});
test("Top-level menus scroll while submenus stay outside the scroll clipping area", () => {
  assert.match(toolbarSource, /@mouseenter="openSubmenu\(index, false, \$event\)"/);
  assert.match(toolbarSource, /class="submenu-panel" :style="submenuPanelStyle"/);
  assert.match(toolbarSource, /function positionSubmenu\(trigger: HTMLElement\)/);
  assert.match(toolbarSource, /\.menu-panel \{[\s\S]*overflow-x: hidden;[\s\S]*overflow-y: auto;/);
  assert.match(toolbarSource, /\.submenu-panel \{[\s\S]*position: fixed;[\s\S]*max-height: calc\(100vh - 1rem\);/);
});
