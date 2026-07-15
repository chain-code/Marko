import { flushPromises, shallowMount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App.vue";
import AboutDialog from "@/components/AboutDialog.vue";
import AppSidebar from "@/components/AppSidebar.vue";
import AppToolbar from "@/components/AppToolbar.vue";
import ConfirmActionDialog from "@/components/ConfirmActionDialog.vue";
import TextInputDialog from "@/components/TextInputDialog.vue";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog.vue";

interface TestFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: TestFileEntry[];
}

const desktop = vi.hoisted(() => ({
  runtime: false,
  closeHandler: null as null | (() => void | Promise<void>),
  createMarkdownFile: vi.fn(async () => "C:/notes/new.md"),
  destroyCurrentWindow: vi.fn(async () => undefined),
  getStartupMarkdownFiles: vi.fn(async () => [] as string[]),
  listMarkdownFolder: vi.fn(async (): Promise<TestFileEntry[]> => []),
  pickFolder: vi.fn(async (): Promise<string | null> => null),
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => "disk content"),
  saveMarkdownAs: vi.fn(async (): Promise<string | null> => "C:/notes/saved-as.md"),
  saveImageAsset: vi.fn(async (_path: string | null, _name: string, dataUrl: string) => dataUrl),
  searchMarkdownFiles: vi.fn<(
    root: string,
    query: string,
  ) => Promise<Array<{ path: string; line: number; snippet: string }>>>(async () => []),
  trashPath: vi.fn(async (): Promise<void> => undefined),
  writeTextFile: vi.fn(async (
    _path: string,
    _content: string,
    _expectedContent: string,
  ): Promise<void> => undefined),
}));

vi.mock("@/services/desktop", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/desktop")>();
  return {
    ...original,
    createMarkdownFile: desktop.createMarkdownFile,
    destroyCurrentWindow: desktop.destroyCurrentWindow,
    getStartupMarkdownFiles: desktop.getStartupMarkdownFiles,
    isTauriRuntime: () => desktop.runtime,
    listMarkdownFolder: desktop.listMarkdownFolder,
    listenNativeFileDrops: vi.fn(async () => () => undefined),
    listenWindowCloseRequested: vi.fn(async (handler: () => void | Promise<void>) => {
      desktop.closeHandler = handler;
      return () => undefined;
    }),
    pickFolder: desktop.pickFolder,
    readTextFile: desktop.readTextFile,
    saveMarkdownAs: desktop.saveMarkdownAs,
    saveImageAsset: desktop.saveImageAsset,
    searchMarkdownFiles: desktop.searchMarkdownFiles,
    trashPath: desktop.trashPath,
    writeTextFile: desktop.writeTextFile,
  };
});

const editor = {
  getViewState: vi.fn(() => ({ anchor: 3, head: 8, scrollTop: 180 })),
  restoreViewState: vi.fn(async () => undefined),
  focus: vi.fn(),
  reserveImageInsertion: vi.fn(() => "<!--marko-image-test-->"),
  replaceImagePlaceholder: vi.fn(() => true),
};

const EditorStub = defineComponent({
  name: "ContinuousMarkdownEditor",
  props: ["modelValue", "filePath", "outline", "settings", "findMatches", "activeFindIndex"],
  emits: [
    "update:modelValue",
    "save",
    "saveAs",
    "open",
    "selection",
    "imageData",
    "openLink",
    "openLinkHref",
    "missingLink",
    "requestSourceSelection",
  ],
  setup(_, { expose }) {
    expose({
      ...editor,
      insertImageMarkdown: vi.fn(),
      insertText: vi.fn(),
      jumpToLine: vi.fn(async () => undefined),
      jumpToSelection: vi.fn(async () => undefined),
      replaceDocument: vi.fn(),
      runCommand: vi.fn(),
      selectRange: vi.fn(async () => undefined),
    });
    return () => h("div", { class: "editor-stub" });
  },
});

function mountApp() {
  return shallowMount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        ContinuousMarkdownEditor: EditorStub,
      },
    },
  });
}

function storeSession(markdown: string, originalMarkdown: string, path = "C:/notes/a.md") {
  localStorage.setItem("marko.editor.session", JSON.stringify({
    version: 1,
    markdown,
    originalMarkdown,
    currentFilePath: path,
    currentFileName: path.split("/").at(-1) ?? "a.md",
    rootPath: "",
  }));
}

beforeEach(() => {
  localStorage.clear();
  desktop.runtime = false;
  desktop.closeHandler = null;
  desktop.createMarkdownFile.mockClear();
  desktop.createMarkdownFile.mockResolvedValue("C:/notes/new.md");
  desktop.destroyCurrentWindow.mockClear();
  desktop.getStartupMarkdownFiles.mockClear();
  desktop.getStartupMarkdownFiles.mockResolvedValue([]);
  desktop.listMarkdownFolder.mockClear();
  desktop.listMarkdownFolder.mockResolvedValue([]);
  desktop.pickFolder.mockClear();
  desktop.pickFolder.mockResolvedValue(null);
  desktop.readTextFile.mockClear();
  desktop.saveMarkdownAs.mockClear();
  desktop.saveMarkdownAs.mockResolvedValue("C:/notes/saved-as.md");
  desktop.saveImageAsset.mockClear();
  desktop.saveImageAsset.mockImplementation(async (_path, _name, dataUrl) => dataUrl);
  editor.reserveImageInsertion.mockClear();
  editor.replaceImagePlaceholder.mockClear();
  desktop.readTextFile.mockResolvedValue("disk content");
  desktop.searchMarkdownFiles.mockClear();
  desktop.searchMarkdownFiles.mockResolvedValue([]);
  desktop.trashPath.mockClear();
  desktop.writeTextFile.mockClear();
  desktop.writeTextFile.mockResolvedValue(undefined);
  editor.getViewState.mockClear();
  editor.restoreViewState.mockClear();
  editor.focus.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("temporarily hides the sidebar in source mode and restores it on exit", async () => {
    const wrapper = mountApp();
    const toolbar = wrapper.findComponent(AppToolbar);
    expect(wrapper.findComponent(AppSidebar).exists()).toBe(true);

    toolbar.vm.$emit("toggleSource");
    await nextTick();
    expect(wrapper.findComponent(AppSidebar).exists()).toBe(false);

    toolbar.vm.$emit("toggleSource");
    await nextTick();
    expect(wrapper.findComponent(AppSidebar).exists()).toBe(true);
    wrapper.unmount();
  });

  it("refreshes a clean restored file from disk before editing", async () => {
    desktop.runtime = true;
    storeSession("cached content", "cached content");
    desktop.readTextFile.mockResolvedValue("fresh\r\ndisk content");
    const wrapper = mountApp();
    await flushPromises();

    expect(desktop.readTextFile).toHaveBeenCalledWith("C:/notes/a.md");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("fresh\ndisk content");
    wrapper.unmount();
  });

  it("keeps a recovered draft detached when the disk file changed externally", async () => {
    desktop.runtime = true;
    storeSession("recovered draft", "saved base");
    desktop.readTextFile.mockResolvedValue("external revision");
    const wrapper = mountApp();
    await flushPromises();

    const editorWrapper = wrapper.findComponent(EditorStub);
    expect(editorWrapper.props("modelValue")).toBe("recovered draft");
    expect(editorWrapper.props("filePath")).toBe("");
    expect(desktop.writeTextFile).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("protects a recovered draft before opening an operating-system startup file", async () => {
    desktop.runtime = true;
    storeSession("recovered draft", "saved base");
    localStorage.setItem("marko.editor.settings", JSON.stringify({
      autoSave: false,
      saveOnFileSwitch: false,
    }));
    desktop.getStartupMarkdownFiles.mockResolvedValue(["C:/notes/b.md"]);
    desktop.readTextFile.mockImplementation(async (path: string) => (
      path === "C:/notes/a.md" ? "saved base" : "file B"
    ));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findComponent(UnsavedChangesDialog).exists()).toBe(true);
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("recovered draft");
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("cancel");
    await flushPromises();
    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/a.md");
    wrapper.unmount();
  });

  it("restores the saved selection and scroll position after returning to a file", async () => {
    storeSession("file A", "file A");
    desktop.readTextFile.mockResolvedValue("file A from disk");
    const wrapper = mountApp();
    const toolbar = wrapper.findComponent(AppToolbar);
    toolbar.vm.$emit("newFile");
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("");
    wrapper.findComponent(AppSidebar).vm.$emit("openFile", "C:/notes/a.md");
    await flushPromises();

    expect(editor.restoreViewState).toHaveBeenLastCalledWith({ anchor: 3, head: 8, scrollTop: 180 });
    wrapper.unmount();
  });

  it("blocks document shortcuts while an application modal is open", async () => {
    const wrapper = mountApp();
    wrapper.findComponent(AppToolbar).vm.$emit("showAbout");
    await nextTick();
    expect(wrapper.findComponent(AboutDialog).exists()).toBe(true);
    const before = wrapper.findComponent(EditorStub).props("modelValue");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true }));
    await nextTick();
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe(before);

    wrapper.findComponent(AboutDialog).vm.$emit("close");
    wrapper.unmount();
  });

  it("honors cancel and discard when the native window closes with unsaved changes", async () => {
    desktop.runtime = true;
    storeSession("changed", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({ autoSave: false }));
    const wrapper = mountApp();
    await flushPromises();
    expect(desktop.closeHandler).not.toBeNull();

    const firstClose = Promise.resolve(desktop.closeHandler?.());
    await nextTick();
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("cancel");
    await firstClose;
    expect(desktop.destroyCurrentWindow).not.toHaveBeenCalled();

    const secondClose = Promise.resolve(desktop.closeHandler?.());
    await nextTick();
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("discard");
    await secondClose;
    expect(desktop.destroyCurrentWindow).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("auto-saves at the configured interval even while typing continues", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({
      autoSave: true,
      autoSaveIntervalMinutes: 1,
    }));
    desktop.readTextFile.mockResolvedValue("saved");
    const wrapper = mountApp();
    await flushPromises();
    desktop.writeTextFile.mockClear();
    vi.useFakeTimers();

    const editorWrapper = wrapper.findComponent(EditorStub);
    editorWrapper.vm.$emit("update:modelValue", "first edit");
    await nextTick();
    await vi.advanceTimersByTimeAsync(30_000);
    editorWrapper.vm.$emit("update:modelValue", "second edit");
    await nextTick();
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();

    expect(desktop.writeTextFile).toHaveBeenCalledWith("C:/notes/a.md", "second edit", "saved");
    wrapper.unmount();
  });

  it("keeps the newest file when concurrent open requests finish out of order", async () => {
    storeSession("file A", "file A");
    const pending = new Map<string, (value: string) => void>();
    desktop.readTextFile.mockImplementation((path: string) => new Promise((resolve) => {
      pending.set(path, resolve);
    }));
    const wrapper = mountApp();
    const sidebar = wrapper.findComponent(AppSidebar);
    sidebar.vm.$emit("openFile", "C:/notes/b.md");
    sidebar.vm.$emit("openFile", "C:/notes/c.md");
    await nextTick();

    pending.get("C:/notes/c.md")?.("file C");
    await flushPromises();
    pending.get("C:/notes/b.md")?.("file B");
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/c.md");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("file C");
    wrapper.unmount();
  });

  it("ignores stale workspace search results", async () => {
    desktop.runtime = true;
    localStorage.setItem("marko.editor.session", JSON.stringify({
      version: 1,
      markdown: "current",
      originalMarkdown: "current",
      currentFilePath: "C:/notes/current.md",
      currentFileName: "current.md",
      rootPath: "C:/notes",
    }));
    const pending = new Map<string, (value: Array<{ path: string; line: number; snippet: string }>) => void>();
    desktop.searchMarkdownFiles.mockImplementation((_root: string, query: string) => new Promise((resolve) => {
      pending.set(query, resolve);
    }));
    const wrapper = mountApp();
    await flushPromises();
    const sidebar = wrapper.findComponent(AppSidebar);
    sidebar.vm.$emit("submitSearch", "old");
    sidebar.vm.$emit("submitSearch", "new");
    await nextTick();

    pending.get("new")?.([{ path: "new.md", line: 2, snippet: "new" }]);
    await flushPromises();
    pending.get("old")?.([{ path: "old.md", line: 1, snippet: "old" }]);
    await flushPromises();

    expect(sidebar.props("searchResults")).toEqual([{ path: "new.md", line: 2, snippet: "new" }]);
    wrapper.unmount();
  });

  it("does not trash a dirty current file when unsaved confirmation is canceled", async () => {
    desktop.runtime = true;
    storeSession("changed", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({ autoSave: false }));
    const wrapper = mountApp();
    await flushPromises();
    wrapper.findComponent(AppSidebar).vm.$emit("fileContextAction", "deletePath", {
      path: "C:/notes/a.md",
      name: "a.md",
      isDir: false,
      source: "tree",
    });
    await nextTick();

    wrapper.findComponent(ConfirmActionDialog).vm.$emit("confirm");
    await flushPromises();
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("cancel");
    await flushPromises();

    expect(desktop.trashPath).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("does not let a delayed reload overwrite edits made while reading", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    const wrapper = mountApp();
    await flushPromises();

    let resolveReload: ((value: string) => void) | undefined;
    desktop.readTextFile.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReload = resolve;
    }));
    wrapper.findComponent(AppToolbar).vm.$emit("reloadFile");
    await nextTick();
    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "edited while loading");
    await nextTick();
    resolveReload?.("reloaded disk content");
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("edited while loading");
    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/a.md");
    wrapper.unmount();
  });

  it("keeps later edits when creating a workspace file finishes late", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    let resolveCreate: ((value: string) => void) | undefined;
    desktop.createMarkdownFile.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(AppSidebar).vm.$emit("fileContextAction", "newFileInFolder", {
      path: "C:/notes",
      name: "notes",
      isDir: true,
      source: "tree",
    });
    await flushPromises();
    wrapper.findComponent(TextInputDialog).vm.$emit("confirm", "new.md");
    await nextTick();
    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "edit after confirming create");
    await nextTick();
    resolveCreate?.("C:/notes/new.md");
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/a.md");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("edit after confirming create");
    wrapper.unmount();
  });

  it("detaches edits made while the current file is being trashed", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({ autoSave: false }));
    let resolveTrash: (() => void) | undefined;
    desktop.trashPath.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveTrash = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(AppSidebar).vm.$emit("fileContextAction", "deletePath", {
      path: "C:/notes/a.md",
      name: "a.md",
      isDir: false,
      source: "tree",
    });
    await nextTick();
    wrapper.findComponent(ConfirmActionDialog).vm.$emit("confirm");
    await flushPromises();
    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "edit while trashing");
    await nextTick();
    resolveTrash?.();
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("edit while trashing");
    const close = Promise.resolve(desktop.closeHandler?.());
    await nextTick();
    expect(wrapper.findComponent(UnsavedChangesDialog).exists()).toBe(true);
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("cancel");
    await close;
    wrapper.unmount();
  });

  it("detaches edits when a containing folder finishes moving to trash", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({ autoSave: false }));
    let resolveTrash: (() => void) | undefined;
    desktop.trashPath.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveTrash = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(AppSidebar).vm.$emit("fileContextAction", "deletePath", {
      path: "C:/notes",
      name: "notes",
      isDir: true,
      source: "tree",
    });
    await nextTick();
    wrapper.findComponent(ConfirmActionDialog).vm.$emit("confirm");
    await flushPromises();
    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "edit while trashing folder");
    resolveTrash?.();
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("edit while trashing folder");
    wrapper.unmount();
  });

  it("blocks document changes until an image placeholder is resolved", async () => {
    storeSession("saved", "saved", "");
    let resolveImage: ((value: string) => void) | undefined;
    desktop.saveImageAsset.mockImplementationOnce(() => new Promise((resolve) => {
      resolveImage = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(EditorStub).vm.$emit("imageData", {
      name: "photo.png",
      dataUrl: "data:image/png;base64,AA==",
      placeholder: "<!--marko-image-test-->",
    });
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("newFile");
    await nextTick();

    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("saved");
    expect(editor.replaceImagePlaceholder).not.toHaveBeenCalled();
    resolveImage?.("data:image/png;base64,AA==");
    await flushPromises();
    expect(editor.replaceImagePlaceholder).toHaveBeenCalledWith(
      "<!--marko-image-test-->",
      "data:image/png;base64,AA==",
      "photo.png",
    );
    wrapper.unmount();
  });

  it("keeps an empty recovered draft dirty after detaching it from a changed file", async () => {
    desktop.runtime = true;
    storeSession("", "saved base");
    desktop.readTextFile.mockResolvedValue("external revision");
    localStorage.setItem("marko.editor.settings", JSON.stringify({ autoSave: false }));
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("");
    const close = Promise.resolve(desktop.closeHandler?.());
    await nextTick();
    expect(wrapper.findComponent(UnsavedChangesDialog).exists()).toBe(true);
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("cancel");
    await close;
    wrapper.unmount();
  });

  it("uses the loaded disk text as the conditional-save baseline", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved\r\n");
    const wrapper = mountApp();
    await flushPromises();
    desktop.writeTextFile.mockClear();

    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "local edit");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await flushPromises();

    expect(desktop.writeTextFile).toHaveBeenCalledWith("C:/notes/a.md", "local edit", "saved\r\n");
    wrapper.unmount();
  });

  it("keeps local edits dirty when the conditional write detects an external change", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({ autoSave: false }));
    desktop.readTextFile.mockResolvedValue("saved");
    desktop.writeTextFile.mockImplementationOnce(async () => {
      throw new Error("文件已被外部修改");
    });
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "local edit");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("local edit");
    expect(wrapper.find(".toast").text()).toContain("文件已被外部修改");
    const close = Promise.resolve(desktop.closeHandler?.());
    await nextTick();
    expect(wrapper.findComponent(UnsavedChangesDialog).exists()).toBe(true);
    wrapper.findComponent(UnsavedChangesDialog).vm.$emit("cancel");
    await close;
    wrapper.unmount();
  });

  it("does not report the document as fully saved when typing continues during a write", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    let resolveWrite: (() => void) | undefined;
    desktop.writeTextFile.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "save snapshot");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await nextTick();
    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "newer edit");
    await nextTick();
    resolveWrite?.();
    await flushPromises();

    expect(wrapper.find(".toast").text()).toContain("仍有未保存更改");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("newer edit");
    wrapper.unmount();
  });

  it("ignores a file-tree refresh that finishes after closing the workspace", async () => {
    desktop.runtime = true;
    localStorage.setItem("marko.editor.session", JSON.stringify({
      version: 1,
      markdown: "saved",
      originalMarkdown: "saved",
      currentFilePath: "C:/notes/a.md",
      currentFileName: "a.md",
      rootPath: "C:/notes",
    }));
    desktop.readTextFile.mockResolvedValue("saved");
    const wrapper = mountApp();
    await flushPromises();

    let resolveRefresh: ((value: TestFileEntry[]) => void) | undefined;
    desktop.listMarkdownFolder.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    wrapper.findComponent(EditorStub).vm.$emit("update:modelValue", "changed");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await flushPromises();
    wrapper.findComponent(AppToolbar).vm.$emit("closeWorkspaceFolder");
    await nextTick();
    resolveRefresh?.([{
      name: "stale.md",
      path: "C:/notes/stale.md",
      isDir: false,
      children: [],
    }]);
    await flushPromises();

    const sidebar = wrapper.findComponent(AppSidebar);
    expect(sidebar.props("rootPath")).toBe("");
    expect(sidebar.props("tree")).toEqual([]);
    wrapper.unmount();
  });

  it("keeps the current path and dirty state when editing during save as", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    desktop.readTextFile.mockResolvedValue("saved");
    let resolveSaveAs: ((path: string | null) => void) | undefined;
    desktop.saveMarkdownAs.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSaveAs = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    const editorWrapper = wrapper.findComponent(EditorStub);
    editorWrapper.vm.$emit("update:modelValue", "snapshot for save as");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("saveAs");
    await nextTick();
    editorWrapper.vm.$emit("update:modelValue", "edit after save as started");
    await nextTick();
    resolveSaveAs?.("C:/notes/saved-as.md");
    await flushPromises();

    expect(desktop.saveMarkdownAs).toHaveBeenCalledWith("snapshot for save as", "C:/notes");
    expect(editorWrapper.props("filePath")).toBe("C:/notes/a.md");
    expect(editorWrapper.props("modelValue")).toBe("edit after save as started");
    expect(document.title.startsWith("● ")).toBe(true);
    wrapper.unmount();
  });

  it("does not let the initial disk refresh overwrite a document saved and edited while it was pending", async () => {
    desktop.runtime = true;
    storeSession("saved", "saved");
    const readResolvers: Array<(value: string) => void> = [];
    desktop.readTextFile.mockImplementation(() => new Promise((resolve) => {
      readResolvers.push(resolve);
    }));
    const wrapper = mountApp();
    await nextTick();
    expect(readResolvers).toHaveLength(1);

    const editorWrapper = wrapper.findComponent(EditorStub);
    editorWrapper.vm.$emit("update:modelValue", "local snapshot");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await nextTick();
    expect(readResolvers).toHaveLength(2);

    readResolvers[1]?.("saved");
    await flushPromises();
    editorWrapper.vm.$emit("update:modelValue", "edit after save");
    await nextTick();
    readResolvers[0]?.("stale initial disk content");
    await flushPromises();

    expect(desktop.writeTextFile).toHaveBeenCalledWith("C:/notes/a.md", "local snapshot", "saved");
    expect(editorWrapper.props("filePath")).toBe("C:/notes/a.md");
    expect(editorWrapper.props("modelValue")).toBe("edit after save");
    expect(document.title.startsWith("● ")).toBe(true);
    wrapper.unmount();
  });

  it("serializes two saves while resolving a missing in-memory disk baseline", async () => {
    storeSession("first snapshot", "saved");
    const wrapper = mountApp();
    await flushPromises();
    desktop.runtime = true;
    desktop.readTextFile.mockClear();
    desktop.readTextFile.mockResolvedValue("saved");
    let resolveFirstWrite: (() => void) | undefined;
    desktop.writeTextFile.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirstWrite = resolve;
    }));

    const editorWrapper = wrapper.findComponent(EditorStub);
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await vi.waitFor(() => {
      expect(desktop.writeTextFile).toHaveBeenCalledTimes(1);
    });
    editorWrapper.vm.$emit("update:modelValue", "second snapshot");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("save");
    await nextTick();

    expect(desktop.readTextFile).toHaveBeenCalledTimes(1);
    expect(desktop.writeTextFile).toHaveBeenCalledTimes(1);
    resolveFirstWrite?.();
    await flushPromises();

    expect(desktop.readTextFile).toHaveBeenCalledTimes(1);
    expect(desktop.writeTextFile.mock.calls).toEqual([
      ["C:/notes/a.md", "first snapshot", "saved"],
      ["C:/notes/a.md", "second snapshot", "first snapshot"],
    ]);
    expect(document.title.startsWith("● ")).toBe(false);
    wrapper.unmount();
  });

  it("detaches a file opened inside a folder while that folder is being trashed", async () => {
    desktop.runtime = true;
    storeSession("outside", "outside", "C:/notes/outside.md");
    desktop.readTextFile.mockImplementation(async (path: string) => (
      path === "C:/notes/deleted/inside.md" ? "inside content" : "outside"
    ));
    let resolveTrash: (() => void) | undefined;
    desktop.trashPath.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveTrash = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    const sidebar = wrapper.findComponent(AppSidebar);
    sidebar.vm.$emit("fileContextAction", "deletePath", {
      path: "C:/notes/deleted",
      name: "deleted",
      isDir: true,
      source: "tree",
    });
    await nextTick();
    wrapper.findComponent(ConfirmActionDialog).vm.$emit("confirm");
    await flushPromises();
    sidebar.vm.$emit("openFile", "C:/notes/deleted/inside.md");
    await flushPromises();
    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/deleted/inside.md");

    resolveTrash?.();
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("inside content");
    expect(document.title.startsWith("● ")).toBe(true);
    wrapper.unmount();
  });

  it("does not open a newly created file after switching workspaces while creation is pending", async () => {
    desktop.runtime = true;
    localStorage.setItem("marko.editor.session", JSON.stringify({
      version: 1,
      markdown: "current document",
      originalMarkdown: "current document",
      currentFilePath: "C:/notes/current.md",
      currentFileName: "current.md",
      rootPath: "C:/notes",
    }));
    desktop.readTextFile.mockResolvedValue("current document");
    desktop.pickFolder.mockResolvedValue("C:/other");
    let resolveCreate: ((value: string) => void) | undefined;
    desktop.createMarkdownFile.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    const wrapper = mountApp();
    await flushPromises();

    wrapper.findComponent(AppSidebar).vm.$emit("fileContextAction", "newFileInFolder", {
      path: "C:/notes",
      name: "notes",
      isDir: true,
      source: "tree",
    });
    await flushPromises();
    wrapper.findComponent(TextInputDialog).vm.$emit("confirm", "new.md");
    await nextTick();
    wrapper.findComponent(AppToolbar).vm.$emit("openFolder");
    await flushPromises();
    expect(wrapper.findComponent(AppSidebar).props("rootPath")).toBe("C:/other");

    resolveCreate?.("C:/notes/new.md");
    await flushPromises();

    expect(wrapper.findComponent(AppSidebar).props("rootPath")).toBe("C:/other");
    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/current.md");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("current document");
    wrapper.unmount();
  });

  it("keeps a recovered draft attached when final-newline insertion explains the disk difference", async () => {
    desktop.runtime = true;
    storeSession("saved\nlocal edit", "saved");
    localStorage.setItem("marko.editor.settings", JSON.stringify({
      autoSave: false,
      insertFinalNewline: true,
    }));
    desktop.readTextFile.mockResolvedValue("saved\n");
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findComponent(EditorStub).props("filePath")).toBe("C:/notes/a.md");
    expect(wrapper.findComponent(EditorStub).props("modelValue")).toBe("saved\nlocal edit");
    expect(document.title.startsWith("● ")).toBe(true);
    wrapper.unmount();
  });
});
