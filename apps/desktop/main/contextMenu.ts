// 右键菜单（L-1、W-6、通用规则 6）：
// - 编辑区：拼写建议、加入词典（electron-context-menu 现成的），下面是同 Typora 的那些项（menu.ts 的 editorContextItems，
//   交给编辑器的命令：编辑器的纯文本粘贴、删除有自己的规则，E-7、C-4）；右键在链接、图片上再加复制链接地址、复制图片；
// - 输入框：拼写建议、剪切复制粘贴、全选。不要「用 Google 搜索」「查询」这些外部服务；
// - 侧栏（文件树、文件列表、最近文件）：渲染进程阻止默认的右键菜单，给出菜单项让主进程弹（popupMenu），选了哪项交回去
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import contextMenu from "electron-context-menu";
import type { PopupItem } from "@marko/shared";
import { t } from "./i18n.ts";

/** 编辑区右键菜单的项：index.ts 交过来 menu.ts 的 editorContextItems（菜单栏那套命令和快捷键；在这里直接引 menu.ts 会绕成一圈） */
let editorContextItems: () => MenuItemConstructorOptions[] = () => [];

export function setEditorContextItems(build: () => MenuItemConstructorOptions[]): void {
  editorContextItems = build;
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
    menu: (actions, params, _window, suggestions) => {
      const spelling: MenuItemConstructorOptions[] = params.misspelledWord ? [...suggestions, actions.separator(), actions.learnSpelling({}), actions.separator()] : [];
      // 编辑区是 contenteditable（formControlType 是 none）
      if (params.isEditable && params.formControlType === "none") {
        const extra = [params.linkURL ? actions.copyLink({}) : null, params.mediaType === "image" ? actions.copyImage({}) : null].filter((entry) => entry !== null);
        return [...spelling, ...editorContextItems(), ...(extra.length ? [actions.separator(), ...extra] : [])];
      }
      // 输入框：浏览器自己的剪切复制粘贴、全选
      if (params.isEditable) return [...spelling, actions.cut({}), actions.copy({}), actions.paste({}), actions.separator(), { role: "selectAll", label: t("menu.edit.selectAll") }];
      return [actions.copy({})];
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
