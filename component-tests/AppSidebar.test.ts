import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AppSidebar from "@/components/AppSidebar.vue";
import type { FileEntry, FilePanelMode, SearchResult, SidebarTab } from "@/types";

const tree: FileEntry[] = [
  {
    name: "docs",
    path: "C:/workspace/docs",
    isDir: true,
    children: [
      {
        name: "guide.md",
        path: "C:/workspace/docs/guide.md",
        isDir: false,
        children: [],
      },
    ],
  },
];

const searchResults: SearchResult[] = [
  {
    path: "C:/workspace/docs/guide.md",
    line: 8,
    snippet: "Typora style search result",
  },
];

function mountSidebar(options: {
  activeTab?: SidebarTab;
  fileMode?: FilePanelMode;
  searchQuery?: string;
  results?: SearchResult[];
} = {}) {
  const activeTab = ref<SidebarTab>(options.activeTab ?? "files");
  const fileMode = ref<FilePanelMode>(options.fileMode ?? "tree");
  const searchQuery = ref(options.searchQuery ?? "");
  const submitSearch = vi.fn<(query: string) => void>();
  const openSearchResult = vi.fn<(result: SearchResult) => void>();

  const Host = defineComponent({
    setup() {
      return () => h(AppSidebar, {
        activeTab: activeTab.value,
        fileMode: fileMode.value,
        tree,
        currentPath: "C:/workspace/docs/guide.md",
        rootPath: "C:/workspace",
        outline: [
          { id: "intro", title: "介绍", level: 1, line: 1 },
          { id: "usage", title: "用法", level: 2, line: 5 },
        ],
        activeOutlineId: "intro",
        collapsibleOutline: true,
        nativeFileActions: false,
        searchQuery: searchQuery.value,
        searchResults: options.results ?? searchResults,
        searchPending: false,
        "onUpdate:activeTab": (value: SidebarTab) => {
          activeTab.value = value;
        },
        "onUpdate:fileMode": (value: FilePanelMode) => {
          fileMode.value = value;
        },
        "onUpdate:searchQuery": (value: string) => {
          searchQuery.value = value;
        },
        onSubmitSearch: submitSearch,
        onOpenSearchResult: openSearchResult,
      });
    },
  });

  const wrapper = mount(Host, { attachTo: document.body });
  return {
    wrapper,
    sidebar: () => wrapper.findComponent(AppSidebar),
    activeTab,
    fileMode,
    searchQuery,
    submitSearch,
    openSearchResult,
  };
}

describe("AppSidebar", () => {
  it("通过点击和方向键切换文件、大纲、搜索三种模式", async () => {
    const mounted = mountSidebar();
    const tabs = mounted.wrapper.findAll<HTMLButtonElement>("[role='tab']");

    expect(tabs.map((tab) => tab.text().trim())).toEqual(["文件", "大纲", "搜索"]);
    expect(tabs[0].attributes("aria-selected")).toBe("true");

    await tabs[1].trigger("click");
    await nextTick();
    expect(mounted.activeTab.value).toBe("outline");
    expect(mounted.wrapper.find("#sidebar-panel-outline").exists()).toBe(true);

    await tabs[1].trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(mounted.activeTab.value).toBe("search");
    expect(document.activeElement).toBe(tabs[2].element);

    await tabs[2].trigger("keydown", { key: "Home" });
    await nextTick();
    expect(mounted.activeTab.value).toBe("files");
    expect(document.activeElement).toBe(tabs[0].element);
    mounted.wrapper.unmount();
  });

  it("受控搜索输入提交查询，选择结果后保留搜索模式和结果", async () => {
    const mounted = mountSidebar();
    const searchTab = mounted.wrapper.findAll<HTMLButtonElement>("[role='tab']")[2];

    await searchTab.trigger("click");
    await nextTick();
    const input = mounted.wrapper.get<HTMLInputElement>("input[aria-label='搜索当前文件夹']");
    expect(document.activeElement).toBe(input.element);

    await input.setValue("  Typora  ");
    await nextTick();
    expect(mounted.searchQuery.value).toBe("  Typora  ");

    await mounted.wrapper.get(".sidebar-search-form").trigger("submit");
    expect(mounted.submitSearch).toHaveBeenCalledWith("Typora");

    await mounted.wrapper.get(".search-result").trigger("click");
    expect(mounted.openSearchResult).toHaveBeenCalledWith(searchResults[0]);
    expect(mounted.activeTab.value).toBe("search");
    expect(mounted.searchQuery.value).toBe("  Typora  ");
    expect(mounted.wrapper.findAll(".search-result")).toHaveLength(1);
    mounted.wrapper.unmount();
  });

  it("底部显示方式按钮发出事件并在文件列表和文件树之间切换", async () => {
    const mounted = mountSidebar();

    await mounted.wrapper.get("button[aria-label='文件列表']").trigger("click");
    await nextTick();
    expect(mounted.fileMode.value).toBe("list");
    expect(mounted.wrapper.find(".file-list").exists()).toBe(true);

    await mounted.wrapper.get("button[aria-label='文件树']").trigger("click");
    await nextTick();
    expect(mounted.fileMode.value).toBe("tree");
    expect(mounted.wrapper.find("[role='tree']").exists()).toBe(true);
    expect(mounted.sidebar().emitted("update:fileMode")).toEqual([["list"], ["tree"]]);
    mounted.wrapper.unmount();
  });

  it("通过菜单键打开文件菜单并支持方向键、Home、End 和 Escape", async () => {
    const mounted = mountSidebar({ fileMode: "list" });
    const fileRow = mounted.wrapper.get<HTMLButtonElement>(".file-row");
    fileRow.element.focus();

    await fileRow.trigger("keydown", { key: "F10", shiftKey: true });
    await nextTick();
    const items = mounted.wrapper.findAll<HTMLButtonElement>(".sidebar-context-menu [role='menuitem']");
    expect(items.length).toBeGreaterThan(2);
    expect(document.activeElement).toBe(items[0].element);

    await items[0].trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(items.at(-1)?.element);
    await items.at(-1)!.trigger("keydown", { key: "Home" });
    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger("keydown", { key: "ArrowUp" });
    expect(document.activeElement).toBe(items.at(-1)?.element);

    await items.at(-1)!.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(mounted.wrapper.find(".sidebar-context-menu").exists()).toBe(false);
    expect(document.activeElement).toBe(fileRow.element);
    mounted.wrapper.unmount();
  });
});
