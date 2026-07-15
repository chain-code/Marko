import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const toolbarSource = readFileSync(resolve("src/components/AppToolbar.vue"), "utf8");
const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("AppToolbar displays Typora Windows file shortcuts", () => {
  assert.match(toolbarSource, /action\("快速打开\.\.\.",\s*Search,\s*\(\) => emit\("quickOpen"\),\s*"Ctrl\+P"\)/);
  assert.match(toolbarSource, /action\("打印\.\.\.",\s*Printer,\s*\(\) => emit\("print"\),\s*"Shift\+Alt\+P"\)/);
  assert.match(toolbarSource, /action\("偏好设置\.\.\.",\s*Settings,\s*\(\) => emit\("settings"\),\s*"Ctrl\+,"\)/);
});

test("AppToolbar lists recent files directly inside Open Recent", () => {
  assert.match(toolbarSource, /recentFiles: RecentFile\[];/);
  assert.match(toolbarSource, /openRecentFile: \[path: string\];/);
  assert.match(toolbarSource, /props\.recentFiles\.slice\(0, 10\)\.map\(recentFileAction\)/);
  assert.match(toolbarSource, /title: file\.path/);
  assert.match(toolbarSource, /run: \(\) => emit\("openRecentFile", file\.path\)/);
  assert.match(toolbarSource, /action\("暂无最近文件"[\s\S]*false, true\)/);
});

test("Paragraph menu displays Typora heading shortcuts without an extra submenu", () => {
  const headings = ["一级标题", "二级标题", "三级标题", "四级标题", "五级标题", "六级标题"];
  assert.match(toolbarSource, /action\("正文",\s*Pilcrow,[^\n]+"Ctrl\+0"\)/);
  headings.forEach((label, index) => {
    assert.match(toolbarSource, new RegExp(`action\\("${label}",[^\\n]+"Ctrl\\+${index + 1}"\\)`));
  });
  assert.doesNotMatch(toolbarSource, /submenu\("标题"/);
});

test("Paragraph menu keeps Typora block and table shortcuts in their native group", () => {
  assert.match(toolbarSource, /action\("数学公式块",\s*Sigma,\s*\(\) => emit\("command", "mathBlock"\),\s*"Ctrl\+Shift\+M"\)/);
  assert.match(toolbarSource, /action\("脚注",\s*NotebookText,\s*\(\) => emit\("command", "footnote"\)\)/);
  assert.match(toolbarSource, /action\("在下方插入行",\s*Rows3,\s*\(\) => emit\("command", "addTableRowBelow"\),\s*"Ctrl\+Enter"\)/);
  assert.match(toolbarSource, /action\("删除表格行",\s*Trash2,\s*\(\) => emit\("command", "deleteTableRow"\),\s*"Ctrl\+Shift\+Backspace"\)/);
  assert.doesNotMatch(toolbarSource, /submenu\("数学"/);
});

test("AppToolbar exposes the Typora-style open link command", () => {
  assert.match(
    toolbarSource,
    /action\("打开链接",\s*Link,\s*\(\) => emit\("command", "openLink"\),\s*"Ctrl\+Shift\+O"\)/,
  );
});

test("AppToolbar exposes the Typora-style copy file path command", () => {
  assert.match(toolbarSource, /copyFilePath: \[];/);
  assert.match(appSource, /@copy-file-path="copyCurrentFilePath"/);
  assert.match(
    toolbarSource,
    /action\("复制文件路径",\s*Copy,\s*\(\) => emit\("copyFilePath"\),\s*undefined,\s*false,\s*!props\.hasLocalFile\)/,
  );
});

test("AppToolbar exposes the Typora-style rename file command", () => {
  assert.match(toolbarSource, /renameFile: \[];/);
  assert.match(appSource, /@rename-file="renameCurrentFile"/);
  assert.match(appSource, /renameMarkdownFile/);
  assert.match(appSource, /replaceRecentFile\(oldPath, nextPath\)/);
  assert.match(
    toolbarSource,
    /action\("重命名文件\.\.\.",\s*PencilLine,\s*\(\) => emit\("renameFile"\),\s*undefined,\s*false,\s*!props\.hasLocalFile\)/,
  );
});

test("AppToolbar exposes locating the current file in the sidebar tree", () => {
  assert.match(toolbarSource, /locateCurrentFile: \[];/);
  assert.match(appSource, /@locate-current-file="locateCurrentFileInTree"/);
  assert.match(appSource, /scrollCurrentFileIntoView/);
  assert.match(
    toolbarSource,
    /action\("在文件树中定位",\s*LocateFixed,\s*\(\) => emit\("locateCurrentFile"\),\s*undefined,\s*false,\s*!props\.hasLocalFile\)/,
  );
});

test("AppToolbar exposes inserting a local image file", () => {
  assert.match(toolbarSource, /insertImageFile: \[];/);
  assert.match(appSource, /@insert-image-file="insertImageFile"/);
  assert.match(appSource, /pickImageFile/);
  assert.match(appSource, /openBrowserImageFile/);
  assert.match(
    toolbarSource,
    /action\("插入本地图片\.\.\.",\s*Image,\s*\(\) => emit\("insertImageFile"\)\)/,
  );
});

test("AppToolbar exposes opening the current file folder as workspace", () => {
  assert.match(toolbarSource, /openCurrentFolderWorkspace: \[];/);
  assert.match(appSource, /@open-current-folder-workspace="openCurrentFolderWorkspace"/);
  assert.match(appSource, /loadWorkspaceFolder\(dirname\(currentFilePath\.value\), "已将所在文件夹作为工作区打开"\)/);
  assert.match(
    toolbarSource,
    /action\("打开所在文件夹为工作区",\s*FolderOpen,\s*\(\) => emit\("openCurrentFolderWorkspace"\),\s*undefined,\s*false,\s*!props\.hasLocalFile\)/,
  );
});

test("AppToolbar exposes closing the current workspace folder", () => {
  assert.match(toolbarSource, /hasWorkspace: boolean;/);
  assert.match(toolbarSource, /closeWorkspaceFolder: \[];/);
  assert.match(appSource, /:has-workspace="Boolean\(rootPath\)"/);
  assert.match(appSource, /@close-workspace-folder="closeWorkspaceFolder"/);
  assert.match(appSource, /fileTree\.value = \[];/);
  assert.match(
    toolbarSource,
    /action\("关闭工作区文件夹",\s*FileX,\s*\(\) => emit\("closeWorkspaceFolder"\),\s*undefined,\s*false,\s*!props\.hasWorkspace\)/,
  );
});

test("AppToolbar exposes refreshing the current workspace folder", () => {
  assert.match(toolbarSource, /refreshWorkspaceFolder: \[];/);
  assert.match(appSource, /@refresh-workspace-folder="refreshWorkspaceFolder"/);
  assert.match(appSource, /loadWorkspaceFolder\(rootPath\.value, "已刷新工作区文件夹"\)/);
  assert.match(
    toolbarSource,
    /action\("刷新工作区文件夹",\s*RotateCcw,\s*\(\) => emit\("refreshWorkspaceFolder"\),\s*undefined,\s*false,\s*!props\.hasWorkspace\)/,
  );
});

test("AppToolbar exposes the Typora-style reveal file command", () => {
  assert.match(toolbarSource, /revealFile: \[];/);
  assert.match(appSource, /@reveal-file="revealCurrentFile"/);
  assert.match(appSource, /revealFileInFolder/);
  assert.match(
    toolbarSource,
    /action\("在资源管理器中显示",\s*FolderOpen,\s*\(\) => emit\("revealFile"\),\s*undefined,\s*false,\s*!props\.hasLocalFile\)/,
  );
});

test("AppToolbar exposes the Typora-style open containing folder command", () => {
  assert.match(toolbarSource, /openContainingFolder: \[];/);
  assert.match(appSource, /@open-containing-folder="openCurrentContainingFolder"/);
  assert.match(appSource, /openContainingFolder/);
  assert.match(
    toolbarSource,
    /action\("打开所在文件夹",\s*FolderOpen,\s*\(\) => emit\("openContainingFolder"\),\s*undefined,\s*false,\s*!props\.hasLocalFile\)/,
  );
});
test("AppToolbar exposes the Typora-style spelling toggle", () => {
  assert.match(toolbarSource, /spellcheck: boolean;/);
  assert.match(toolbarSource, /toggleSpellcheck: \[];/);
  assert.match(appSource, /:spellcheck="settings\.spellcheck"/);
  assert.match(appSource, /@toggle-spellcheck="patchSettings\(\{ spellcheck: !settings\.spellcheck \}\)"/);
  assert.match(
    toolbarSource,
    /action\("拼写检查",\s*CheckSquare,\s*\(\) => emit\("toggleSpellcheck"\),\s*undefined,\s*props\.spellcheck\)/,
  );
});

test("AppToolbar exposes the Typora-style status bar toggle", () => {
  assert.match(toolbarSource, /statusBarVisible: boolean/);
  assert.match(toolbarSource, /toggleStatusBar: \[\]/);
  assert.match(toolbarSource, /action\("显示状态栏",\s*PanelLeft,\s*\(\) => emit\("toggleStatusBar"\)[\s\S]*props\.statusBarVisible\)/);
  assert.match(appSource, /@toggle-status-bar="patchSettings\(\{ showStatusBar: !settings\.showStatusBar \}\)"/);
});

test("AppToolbar exposes the Typora-style image width command", () => {
  assert.match(
    toolbarSource,
    /action\("设置图片宽度\.\.\.",\s*Image,\s*\(\) => emit\("command", "setImageWidth"\)\)/,
  );
});
