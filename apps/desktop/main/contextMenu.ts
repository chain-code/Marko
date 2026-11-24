// 右键菜单（L-1、W-6、通用规则 6）：
// - 编辑区、输入框：electron-context-menu 现成的原生菜单——拼写建议、加入词典、剪切复制粘贴；编辑区再加「粘贴为纯文本」「全选」
//   （交给编辑器：编辑器的全选、纯文本粘贴有自己的规则，E-7、C-4）。不要「用 Google 搜索」「查询」这些外部服务；
// - 侧栏（文件树、文件列表、最近文件）：渲染进程阻止默认的右键菜单，给出菜单项让主进程弹（popupMenu），选了哪项交回去
import { BrowserWindow, clipboard, Menu, type MenuItemConstructorOptions } from "electron";
import contextMenu from "electron-context-menu";
import { EVENTS, type PopupItem } from "@marko/shared";
import { t } from "./i18n.ts";

function send(window: BrowserWindow, id: string, argument?: string): void {
  if (!window.isDestroyed()) window.webContents.send(EVENTS.menuCommand, argument === undefined ? { id } : { id, argument });
}

export function installContextMenu(window: BrowserWindow): void {
  contextMenu({
    window,
    showLookUpSelection: false,
    showSearchWithGoogle: false,
    showInspectElement: false,
    showServices: false,
    showSelectAll: false,
    showCopyImage: true,
    showCopyImageAddress: false,
    showSaveImage: false,
    showSaveImageAs: false,
    showCopyVideoAddress: false,
    showSaveVideo: false,
    showSaveVideoAs: false,
    showCopyLink: true,
    showSaveLinkAs: false,
    // 每次弹菜单时现取（L-2：换了界面语言，下次弹出就是新的文字）
    labels: {
      get learnSpelling() {
        return t("contextMenu.learnSpelling");
      },
      get cut() {
        return t("menu.edit.cut");
      },
      get copy() {
        return t("menu.edit.copy");
      },
      get paste() {
        return t("menu.edit.paste");
      },
      get copyLink() {
        return t("contextMenu.copyLink");
      },
      get copyImage() {
        return t("contextMenu.copyImage");
      },
    },
    // 能编辑的地方、选了文字的地方才弹（侧栏的由渲染进程自己弹）
    shouldShowMenu: (_event, params) => params.isEditable || params.selectionText.trim().length > 0,
    append: (_defaults, params) => {
      if (!params.isEditable) return [];
      // 编辑区是 contenteditable（formControlType 是 none）；输入框用浏览器自己的全选
      if (params.formControlType !== "none") return [{ role: "selectAll", label: t("menu.edit.selectAll") }];
      return [
        { label: t("menu.edit.pastePlainText"), click: async () => send(window, "editor.pastePlainText", await clipboard.readText()) },
        { type: "separator" },
        { label: t("menu.edit.selectAll"), click: () => send(window, "editor.selectAll") },
      ];
    },
  });
}

/** 按渲染进程给的菜单项弹一个原生菜单，返回选了哪项（没选是 null） */
export function popupMenu(window: BrowserWindow, items: PopupItem[]): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const template: MenuItemConstructorOptions[] = items.map((item) =>
      item.type === "separator" ? { type: "separator" } : { label: item.label, enabled: item.enabled ?? true, click: () => finish(item.id) },
    );
    // 菜单关掉的回调可能比点了的那项的回调先来：等一下，还没点任何项才算没选
    Menu.buildFromTemplate(template).popup({ window, callback: () => setTimeout(() => finish(null), 200) });
  });
}
