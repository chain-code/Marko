// @vitest-environment jsdom
// 文档会话（F 章）：打开、保存、另存、冲突、未保存确认、标题栏
import { DEFAULT_SETTINGS, EVENTS, type Settings } from "@marko/shared";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { createFakeApi, type FakeApi } from "../testing/fakeApi.ts";
import { suggestedName, useDocument, type DocumentDialogs, type DocumentSession } from "./useDocument.ts";

function setup(api: FakeApi, dialogs: Partial<DocumentDialogs> = {}, settings: Partial<Settings> = {}) {
  const fullDialogs: DocumentDialogs = {
    confirmUnsaved: vi.fn(async () => "cancel" as const),
    resolveConflict: vi.fn(async () => "cancel" as const),
    resolveExternalChange: vi.fn(async () => "keep" as const),
    resolveDraftConflict: vi.fn(async () => "draft" as const),
    confirmRemoveRecent: vi.fn(async () => true),
    error: vi.fn(),
    info: vi.fn(),
    status: vi.fn(),
    ...dialogs,
  };
  let session!: DocumentSession;
  const wrapper = mount(
    defineComponent({
      setup() {
        session = useDocument(api, fullDialogs, () => ({ ...DEFAULT_SETTINGS, ...settings }));
        return () => null;
      },
    }),
  );
  return { session, dialogs: fullDialogs, wrapper };
}

describe("F 章：文档会话", () => {
  it("新文档：标题「未命名.md」，没改过（pristine）；输入以后标题栏带 ●", async () => {
    const api = createFakeApi();
    const { session } = setup(api);
    await nextTick();
    expect(api.states.at(-1)).toEqual({ path: null, title: "未命名.md", edited: false, pristine: true, hash: null });
    session.content.value = "# 你好";
    await nextTick();
    expect(api.states.at(-1)).toMatchObject({ edited: true, pristine: false });
  });

  it("打开（F-3）：空白新文档时在这个窗口打开；否则交给新窗口", async () => {
    const api = createFakeApi({ "/d/a.md": "# A", "/d/b.md": "# B" });
    const { session } = setup(api);
    await nextTick();
    await session.openPath("/d/a.md");
    expect(session.content.value).toBe("# A");
    expect(session.title.value).toBe("a.md");
    await nextTick();
    await session.openPath("/d/b.md");
    expect(session.content.value).toBe("# A");
    expect(api.newWindows).toBe(1);
  });

  it("保存（F-6）：写回原来的文件，之后没改过；S-3 打开时补末尾换行", async () => {
    const api = createFakeApi({ "/d/a.md": "x" });
    const { session } = setup(api, {}, { insertFinalNewline: true });
    await nextTick();
    await session.openPath("/d/a.md");
    session.content.value = "x\r\ny";
    expect(await session.save()).toBe(true);
    expect(api.disk.get("/d/a.md")).toBe("x\r\ny\r\n");
    expect(session.edited.value).toBe(false);
  });

  it("新文档保存就是另存（F-7）：建议的文件名取第一个标题；取消时还是新文档", async () => {
    expect(suggestedName("前言\n\n## 第一章：开始?\n")).toBe("第一章：开始.md");
    expect(suggestedName("没有标题")).toBe("未命名.md");
    const api = createFakeApi();
    const saveAs = vi.spyOn(api.file, "saveAs");
    const { session } = setup(api);
    session.content.value = "# 标题\n\n正文";
    expect(await session.save()).toBe(false);
    expect(saveAs.mock.calls[0][0].suggestedName).toBe("标题.md");
    api.saveAsPath = "/d/标题.md";
    expect(await session.save()).toBe(true);
    expect(session.path.value).toBe("/d/标题.md");
    expect(api.disk.get("/d/标题.md")).toBe("# 标题\n\n正文");
  });

  it("冲突（F-6）：别的程序改过——覆盖、载入磁盘上的版本、另存为、取消", async () => {
    const api = createFakeApi({ "/d/a.md": "one" });
    let choice: "overwrite" | "reload" | "saveAs" | "cancel" = "cancel";
    const { session, dialogs } = setup(api, { resolveConflict: vi.fn(async () => choice) });
    await nextTick();
    await session.openPath("/d/a.md");
    api.touch("/d/a.md", "theirs");
    session.content.value = "mine";
    expect(await session.save()).toBe(false);
    expect(dialogs.resolveConflict).toHaveBeenCalledWith("a.md");
    expect(api.disk.get("/d/a.md")).toBe("theirs");
    choice = "reload";
    await session.save();
    expect(session.content.value).toBe("theirs");
    api.touch("/d/a.md", "theirs again");
    session.content.value = "mine";
    choice = "overwrite";
    expect(await session.save()).toBe(true);
    expect(api.disk.get("/d/a.md")).toBe("mine");
  });

  it("关窗口（F-10）：没改过直接关；改过时问——保存、不保存、取消", async () => {
    const api = createFakeApi({ "/d/a.md": "x" });
    let choice: "save" | "discard" | "cancel" = "cancel";
    const { session } = setup(api, { confirmUnsaved: vi.fn(async () => choice) });
    await nextTick();
    await session.openPath("/d/a.md");
    api.emit(EVENTS.closeRequested, { reason: "close" });
    await vi.waitFor(() => expect(api.closed).toBe(1));
    session.content.value = "changed";
    await session.handleCloseRequest();
    expect(api.cancelled).toBe(1);
    choice = "save";
    await session.handleCloseRequest();
    expect(api.disk.get("/d/a.md")).toBe("changed");
    expect(api.closed).toBe(2);
    session.content.value = "again";
    choice = "discard";
    await session.handleCloseRequest();
    expect(api.disk.get("/d/a.md")).toBe("changed");
    expect(api.closed).toBe(3);
  });

  it("从最近文件打开失败：问要不要从列表里去掉（F-3）", async () => {
    const api = createFakeApi({ "/d/a.md": "x" });
    const { session, dialogs } = setup(api);
    await session.openPath("/d/a.md");
    api.disk.delete("/d/a.md");
    await session.openPath("/d/a.md", { fromRecent: true });
    expect(dialogs.confirmRemoveRecent).toHaveBeenCalled();
    expect(await api.recent.list()).toEqual([]);
  });

  it("侧栏里换文件（F-8、F-10）：在这个窗口里换；有改动时问，或者按设置先保存；在别的窗口开着时不换", async () => {
    const api = createFakeApi({ "/d/a.md": "# A", "/d/b.md": "# B", "/d/c.md": "# C" });
    const confirmUnsaved = vi.fn(async () => "cancel" as const);
    // 「切换文件时自动保存」默认开着，这里关掉看确认
    const { session } = setup(api, { confirmUnsaved }, { saveOnFileSwitch: false });
    await nextTick();
    expect(await session.switchTo("/d/a.md")).toBe(true);
    await nextTick();
    // 没改过：直接换，不开新窗口
    expect(await session.switchTo("/d/b.md")).toBe(true);
    expect(session.content.value).toBe("# B");
    expect(api.newWindows).toBe(0);
    await nextTick();
    // 就是这个文件：不动
    expect(await session.switchTo("/d/b.md")).toBe(true);
    // 改过了、选「取消」：不换
    session.content.value = "# B!";
    expect(await session.switchTo("/d/c.md")).toBe(false);
    expect(confirmUnsaved).toHaveBeenCalledWith("b.md");
    expect(session.content.value).toBe("# B!");
    // 在别的窗口里开着：切过去，这里不换
    api.elsewhere.add("/d/c.md");
    expect(await session.switchTo("/d/c.md")).toBe(false);
    expect(session.path.value).toBe("/d/b.md");
  });

  it("S-3「切换文件时自动保存」：先保存再换，不问", async () => {
    const api = createFakeApi({ "/d/a.md": "# A", "/d/b.md": "# B" });
    const confirmUnsaved = vi.fn(async () => "cancel" as const);
    const { session } = setup(api, { confirmUnsaved }, { saveOnFileSwitch: true });
    await nextTick();
    await session.switchTo("/d/a.md");
    session.content.value = "# A changed";
    expect(await session.switchTo("/d/b.md")).toBe(true);
    expect(confirmUnsaved).not.toHaveBeenCalled();
    expect(api.disk.get("/d/a.md")).toBe("# A changed");
    expect(session.content.value).toBe("# B");
  });

  it("新建（F-1）：当前是空白新文档时不动；否则新开一个窗口", async () => {
    const api = createFakeApi();
    const { session } = setup(api);
    await session.newDocument();
    expect(api.newWindows).toBe(0);
    session.content.value = "x";
    await nextTick();
    await session.newDocument();
    expect(api.newWindows).toBe(1);
  });
});

describe("F-8 自动保存、F-9 草稿、F-12 外部修改", () => {
  it("F-8：保存过的文档改了以后按间隔保存；一直在改也不重新计时；新文档不自动保存", async () => {
    vi.useFakeTimers();
    try {
      const api = createFakeApi({ "/d/a.md": "A" });
      const { session } = setup(api, {}, { autoSave: true, autoSaveIntervalMinutes: 1 });
      await session.openPath("/d/a.md");
      session.content.value = "A1";
      await nextTick();
      await vi.advanceTimersByTimeAsync(40_000);
      session.content.value = "A12";
      await nextTick();
      await vi.advanceTimersByTimeAsync(25_000);
      expect(api.disk.get("/d/a.md")).toBe("A12");
      expect(session.edited.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("F-9：停止输入 1 秒后写草稿；保存后删掉；关窗口选「不保存」也删掉", async () => {
    vi.useFakeTimers();
    try {
      const api = createFakeApi({ "/d/a.md": "A" });
      const { session } = setup(api, { confirmUnsaved: vi.fn(async () => "discard" as const) }, { autoSave: false });
      await session.openPath("/d/a.md");
      session.content.value = "A changed";
      await nextTick();
      await vi.advanceTimersByTimeAsync(1_100);
      const [draft] = [...api.drafts.values()];
      expect(draft).toMatchObject({ path: "/d/a.md", content: "A changed", hash: "/d/a.md#1" });
      await session.save();
      expect(api.drafts.size).toBe(0);
      session.content.value = "again";
      await nextTick();
      await vi.advanceTimersByTimeAsync(1_100);
      expect(api.drafts.size).toBe(1);
      await session.handleCloseRequest();
      expect(api.drafts.size).toBe(0);
      expect(api.closed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("F-9 恢复草稿：内容放回来、算没保存；原文件在这期间被改过时问，选磁盘上的版本就丢掉草稿", async () => {
    const api = createFakeApi({ "/d/a.md": "disk" });
    const untitled = setup(api);
    await untitled.session.restoreDraft({ id: "draft-0001", path: null, content: "# 草稿", encoding: "utf-8", bom: false, disk: null, diskChanged: false });
    expect(untitled.session.content.value).toBe("# 草稿");
    expect(untitled.session.edited.value).toBe(true);
    expect(untitled.dialogs.info).toHaveBeenCalledWith("已从草稿恢复「未命名.md」");
    // F-19 导入的新文档同样放进来，提示的是导入
    const imported = setup(api);
    await imported.session.restoreDraft({ id: "draft-0003", path: null, content: "导入的", encoding: "utf-8", bom: false, disk: null, diskChanged: false, importedFrom: "报告.docx" });
    expect(imported.session.edited.value).toBe(true);
    expect(imported.dialogs.info).toHaveBeenCalledWith("已导入「报告.docx」");

    const disk = { path: "/d/a.md", content: "disk", encoding: "utf-8", bom: false, hash: "/d/a.md#1" };
    const changed = setup(api, { resolveDraftConflict: vi.fn(async () => "disk" as const) });
    api.drafts.set("draft-0002", { id: "draft-0002", path: "/d/a.md", content: "mine", encoding: "utf-8", bom: false, hash: "old" });
    await changed.session.restoreDraft({ id: "draft-0002", path: "/d/a.md", content: "mine", encoding: "utf-8", bom: false, disk, diskChanged: true });
    expect(changed.session.content.value).toBe("disk");
    expect(changed.session.edited.value).toBe(false);
    expect(api.drafts.has("draft-0002")).toBe(false);
  });

  it("F-12：没改过时自动重新载入并提示；改过时问——保留我的改动以后保存覆盖、不再提示冲突", async () => {
    const api = createFakeApi({ "/d/a.md": "one" });
    const { session, dialogs } = setup(api, {}, { autoSave: false });
    await session.openPath("/d/a.md");
    api.touch("/d/a.md", "two");
    await session.handleExternalChange({ path: "/d/a.md", deleted: false, hash: "/d/a.md#2" });
    expect(session.content.value).toBe("two");
    expect(dialogs.status).toHaveBeenCalledWith("「a.md」在外部被修改，已重新载入");

    session.content.value = "mine";
    api.touch("/d/a.md", "three");
    await session.handleExternalChange({ path: "/d/a.md", deleted: false, hash: "/d/a.md#3" });
    expect(dialogs.resolveExternalChange).toHaveBeenCalledWith("a.md");
    expect(session.content.value).toBe("mine");
    expect(await session.save()).toBe(true);
    expect(dialogs.resolveConflict).not.toHaveBeenCalled();
    expect(api.disk.get("/d/a.md")).toBe("mine");
  });

  it("F-12：文件被删了——标题标出「已删除」，内容保留，保存时另存为", async () => {
    const api = createFakeApi({ "/d/a.md": "keep me" });
    const { session } = setup(api, {}, { autoSave: false });
    await session.openPath("/d/a.md");
    api.disk.delete("/d/a.md");
    await session.handleExternalChange({ path: "/d/a.md", deleted: true, hash: null });
    expect(session.title.value).toBe("a.md（已删除）");
    expect(session.content.value).toBe("keep me");
    api.saveAsPath = "/d/b.md";
    expect(await session.save()).toBe(true);
    expect(api.disk.get("/d/b.md")).toBe("keep me");
    expect(session.title.value).toBe("b.md");
  });
});
