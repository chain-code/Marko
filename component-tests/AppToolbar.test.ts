import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import AppToolbar from "@/components/AppToolbar.vue";
import type { RecentFile } from "@/types";

const recentFiles: RecentFile[] = Array.from({ length: 12 }, (_, index) => ({
  name: `note-${index + 1}.md`,
  path: `C:/notes/note-${index + 1}.md`,
  openedAt: 100 - index,
}));

function mountToolbar(files: RecentFile[] = recentFiles) {
  return mount(AppToolbar, {
    attachTo: document.body,
    props: {
      sourceMode: false,
      focusMode: false,
      typewriterMode: false,
      sidebarVisible: true,
      sidebarActiveTab: "files",
      filePanelMode: "tree",
      hasLocalFile: false,
      hasWorkspace: false,
      theme: "solo",
      spellcheck: true,
      statusBarVisible: true,
      recentFiles: files,
    },
  });
}

function findButtonByText(wrapper: ReturnType<typeof mountToolbar>, text: string) {
  return wrapper.findAll<HTMLButtonElement>("button").find((button) => {
    const label = button.find(".menu-label");
    return (label.exists() ? label.text() : button.text()).trim() === text;
  });
}

describe("AppToolbar", () => {
  it("提供完整菜单 ARIA 语义并限制最近文件为十条", async () => {
    const wrapper = mountToolbar();
    expect(wrapper.get("[role='menubar']").attributes("aria-label")).toBe("主菜单");
    const topLevelItems = wrapper.findAll<HTMLButtonElement>("[data-menu-trigger]");
    expect(topLevelItems).toHaveLength(7);
    expect(topLevelItems.every((item) => item.attributes("role") === "menuitem")).toBe(true);

    await topLevelItems[0].trigger("click");
    await nextTick();
    expect(wrapper.get("#app-menu-panel-file").attributes("role")).toBe("menu");

    const recentTrigger = findButtonByText(wrapper, "打开最近");
    expect(recentTrigger).toBeDefined();
    await recentTrigger!.trigger("click");
    await nextTick();

    const recentPanel = wrapper.get("#app-menu-submenu-panel-file-4");
    expect(recentPanel.attributes("role")).toBe("menu");
    const directRecentItems = recentPanel.findAll<HTMLButtonElement>("button[title]");
    expect(directRecentItems).toHaveLength(10);
    expect(directRecentItems[0].attributes("title")).toBe("C:/notes/note-1.md");
    expect(directRecentItems[9].attributes("title")).toBe("C:/notes/note-10.md");
    wrapper.unmount();
  });

  it("通过 F10、方向键和逐级 Escape 完成 Windows 菜单导航", async () => {
    const previousFocus = document.createElement("input");
    document.body.append(previousFocus);
    previousFocus.focus();
    const wrapper = mountToolbar();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", bubbles: true }));
    await nextTick();
    const fileTrigger = wrapper.get<HTMLButtonElement>("#app-menu-trigger-file");
    expect(document.activeElement).toBe(fileTrigger.element);

    await fileTrigger.trigger("keydown", { key: "ArrowDown" });
    await nextTick();
    expect(document.activeElement?.textContent).toContain("新建");

    const recentTrigger = findButtonByText(wrapper, "打开最近")!;
    recentTrigger.element.focus();
    await recentTrigger.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("保存");
    await (document.activeElement as HTMLButtonElement).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement).toBe(recentTrigger.element);

    await recentTrigger.trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(document.activeElement?.textContent?.trim()).toContain("note-1.md");

    const firstRecent = wrapper.get<HTMLButtonElement>("#app-menu-submenu-panel-file-4 button[data-menu-level='submenu']");
    await firstRecent.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(wrapper.find("#app-menu-submenu-panel-file-4").exists()).toBe(false);
    expect(document.activeElement).toBe(recentTrigger.element);

    await recentTrigger.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(wrapper.find("#app-menu-panel-file").exists()).toBe(false);
    expect(document.activeElement).toBe(fileTrigger.element);

    await fileTrigger.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.activeElement).toBe(previousFocus);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));
    await nextTick();
    expect(document.activeElement).toBe(fileTrigger.element);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));
    await nextTick();
    expect(document.activeElement).toBe(previousFocus);
    wrapper.unmount();
    previousFocus.remove();
  });

  it("左右切换顶级菜单并使用 Enter 或 Space 执行动作", async () => {
    const wrapper = mountToolbar();
    const fileTrigger = wrapper.get<HTMLButtonElement>("#app-menu-trigger-file");
    fileTrigger.element.focus();

    await fileTrigger.trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(wrapper.get("#app-menu-trigger-edit").element);

    const editTrigger = wrapper.get<HTMLButtonElement>("#app-menu-trigger-edit");
    await editTrigger.trigger("keydown", { key: "ArrowDown" });
    await nextTick();
    const undo = findButtonByText(wrapper, "撤销")!;
    expect(document.activeElement).toBe(undo.element);

    await undo.trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(wrapper.find("#app-menu-panel-paragraph").exists()).toBe(true);
    expect(document.activeElement?.textContent).toContain("正文");

    const paragraphText = findButtonByText(wrapper, "正文")!;
    await paragraphText.trigger("keydown", { key: "ArrowLeft" });
    await nextTick();
    expect(wrapper.find("#app-menu-panel-edit").exists()).toBe(true);

    await wrapper.get<HTMLButtonElement>("#app-menu-trigger-file").trigger("click");
    await nextTick();
    const quickOpen = findButtonByText(wrapper, "快速打开...")!;
    await quickOpen.trigger("keydown", { key: " " });
    expect(wrapper.emitted("quickOpen")).toHaveLength(1);
    expect(wrapper.find("#app-menu-panel-file").exists()).toBe(false);
    wrapper.unmount();
  });

  it("空的最近文件子菜单不可执行，文件项按路径发出打开事件", async () => {
    const emptyWrapper = mountToolbar([]);
    await emptyWrapper.get<HTMLButtonElement>("#app-menu-trigger-file").trigger("click");
    await nextTick();
    await findButtonByText(emptyWrapper, "打开最近")!.trigger("click");
    await nextTick();
    expect(findButtonByText(emptyWrapper, "暂无最近文件")!.attributes("disabled")).toBeDefined();
    emptyWrapper.unmount();

    const wrapper = mountToolbar();
    await wrapper.get<HTMLButtonElement>("#app-menu-trigger-file").trigger("click");
    await nextTick();
    await findButtonByText(wrapper, "打开最近")!.trigger("click");
    await nextTick();
    const firstRecent = wrapper.get<HTMLButtonElement>("#app-menu-submenu-panel-file-4 button[title]");
    await firstRecent.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("openRecentFile")).toEqual([["C:/notes/note-1.md"]]);
    wrapper.unmount();
  });

  it("关于菜单发出应用内对话框事件", async () => {
    const wrapper = mountToolbar();
    await wrapper.get<HTMLButtonElement>("#app-menu-trigger-help").trigger("click");
    await nextTick();
    await findButtonByText(wrapper, "关于 Marko")!.trigger("click");
    expect(wrapper.emitted("showAbout")).toHaveLength(1);
    wrapper.unmount();
  });

  it("执行普通菜单动作后把焦点还给编辑器", async () => {
    const editor = document.createElement("textarea");
    document.body.append(editor);
    editor.focus();
    const wrapper = mountToolbar();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", bubbles: true }));
    await nextTick();
    const fileTrigger = wrapper.get<HTMLButtonElement>("#app-menu-trigger-file");
    await fileTrigger.trigger("keydown", { key: "ArrowDown" });
    await nextTick();
    const save = findButtonByText(wrapper, "保存")!;
    save.element.focus();
    await save.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("save")).toHaveLength(1);
    expect(document.activeElement).toBe(editor);
    wrapper.unmount();
    editor.remove();
  });
});
