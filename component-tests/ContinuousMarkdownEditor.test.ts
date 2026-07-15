import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorCommand, EditorSettings } from "@/types";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><path d="M0 0h640v320H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

function mountEditor(
  markdown = "# 标题\n\n正文",
  overrides: Partial<EditorSettings> = {},
  attachToDocument = true,
) {
  return mount(ContinuousMarkdownEditor, {
    ...(attachToDocument ? { attachTo: document.body } : {}),
    props: {
      modelValue: markdown,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        ...overrides,
        extensions: { ...defaultEditorSettings.extensions, ...overrides.extensions },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

describe("ContinuousMarkdownEditor", () => {
  it("折叠标题后的源码空行并在光标进入时恢复可编辑高度", async () => {
    const source = "# 标题\n\n正文\n\n## 小节\n\n正文二";
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();

    const lines = wrapper.findAll(".cm-line");
    expect(lines[0]?.classes()).toEqual(expect.arrayContaining(["cm-heading", "cm-heading-1"]));
    expect(lines[1]?.classes()).toContain("cm-heading-gap");
    expect(lines[2]?.classes()).toContain("cm-paragraph");
    expect(lines[4]?.classes()).toEqual(expect.arrayContaining(["cm-heading", "cm-heading-2"]));
    expect(lines[5]?.classes()).toContain("cm-heading-gap");

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const blankOffset = "# 标题\n".length;
    await editor.selectRange(blankOffset, blankOffset);
    await wrapper.vm.$nextTick();

    const activeLines = wrapper.findAll(".cm-line");
    expect(activeLines[1]?.classes()).toEqual(expect.arrayContaining([
      "cm-heading-gap",
      "cm-active-markdown-line",
    ]));
    wrapper.unmount();

    const sourceWrapper = mountEditor(source, { sourceMode: true });
    await sourceWrapper.vm.$nextTick();
    expect(sourceWrapper.find(".cm-heading-gap").exists()).toBe(false);
    sourceWrapper.unmount();
  });

  it("折叠列表和表格边界空行并渲染更醒目的无序圆点", async () => {
    const source = [
      "task-service 不负责：",
      "",
      "- 不 fork 插件，不管理本机进程。",
      "- 不读取检材内容。",
      "",
      "| 服务 | 职责 |",
      "| --- | --- |",
      "| task-service | 调度任务 |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".cm-block-gap")).toHaveLength(2);
    const markers = wrapper.findAll(".cm-bullet-list .cm-rendered-list-marker");
    expect(markers).toHaveLength(2);
    expect(markers.every((marker) => marker.text().includes("•"))).toBe(true);
    wrapper.unmount();
  });

  it("mounts one CodeMirror document and exposes file view state", async () => {
    const wrapper = mountEditor();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".cm-editor")).toHaveLength(1);
    expect(wrapper.get(".cm-content").text()).toContain("标题");

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      restoreViewState: (state: { anchor: number; head: number; scrollTop: number }) => Promise<void>;
      getViewState: () => { anchor: number; head: number; scrollTop: number };
    };
    const scrollContainer = wrapper.element.parentElement as HTMLElement;
    scrollContainer.classList.add("editor-scroll");
    await editor.restoreViewState({ anchor: 2, head: 4, scrollTop: 120 });
    expect(editor.getViewState()).toEqual({ anchor: 2, head: 4, scrollTop: 120 });

    wrapper.unmount();
  });

  it("applies commands to the continuous document and emits the whole Markdown value", async () => {
    const wrapper = mountEditor("before\n\nafter");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      insertText: (text: string) => void;
    };

    await editor.selectRange(0, 6);
    editor.insertText("updated");

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates.at(-1)).toEqual(["updated\n\nafter"]);
    wrapper.unmount();
  });

  it("keeps application-level replacements in the CodeMirror undo history", async () => {
    const wrapper = mountEditor("before");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      replaceDocument: (value: string) => void;
      runCommand: (command: "undo" | "redo") => void;
    };

    editor.replaceDocument("after");
    editor.runCommand("undo");
    editor.runCommand("redo");

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates).toEqual([["after"], ["before"], ["after"]]);
    wrapper.unmount();
  });

  it("isolates explicit formatting commands into separate undo steps", async () => {
    const wrapper = mountEditor("word", { sourceMode: true }, false);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };

    await editor.selectRange(0, 4, false);
    editor.runCommand("bold");
    await settleUi();
    editor.runCommand("italic");
    await settleUi();
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual(["**word**"]);
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual(["word"]);
    wrapper.unmount();
  });

  it("renders block previews without a plugin decoration crash and reveals source on click", async () => {
    const wrapper = mountEditor("paragraph\n\n```ts\nconst value = 1;\n```\n");
    await wrapper.vm.$nextTick();

    const preview = wrapper.get(".cm-special-preview-code");
    expect(preview.attributes("role")).toBe("button");
    await preview.trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    expect(wrapper.get(".cm-content").text()).toContain("const value = 1;");
    wrapper.unmount();
  });

  it("renders a Mermaid flowchart widget and opens its viewer on double-click", async () => {
    mermaidMock.render.mockClear();
    const source = [
      "前言",
      "",
      "```mermaid",
      "flowchart LR",
      "    CASE[\"case-service\"] -->|\"创建检材 / 删除事件\"| TS",
      "",
      "    subgraph TS[\"task-service\"]",
      "        CFG[\"流水线配置<br/>first_task · batch · dependence\"]",
      "        CREATE[\"任务创建器<br/>首任务 · 批次 · 缺失依赖\"]",
      "        SCHED[\"Scheduler<br/>先批次 · 后依赖\"]",
      "        PUB[\"TaskPublisher\"]",
      "        BIND[\"/task/new<br/>完整 owner 原子绑定\"]",
      "        REG[\"ExecutorRegistry / Heartbeat\"]",
      "        FSR[\"FileServiceRouter<br/>hash(case_id)\"]",
      "        DB[((\"集中式 tasks\"))]",
      "    end",
      "",
      "    MQ[((\"NATS JetStream<br/>TASK_DISPATCH\"))]",
      "    EVENTS[((\"NATS JetStream<br/>SYSTEM_EVENTS\"))]",
      "",
      "    subgraph NODE[\"执行节点\"]",
      "        DISPATCH[\"DispatchLoop<br/>运行计数 · FetchNoWait(1)<br/>仅轮询任务 Consumer\"]",
      "        PS[\"plugin-service<br/>fork · cmd.Wait\"]",
      "        P[\"插件进程<br/>先 /task/new · 后执行业务\"]",
      "        FS[\"挂载与 netfileserver\"]",
      "    end",
      "",
      "    CFG --> CREATE",
      "    CREATE --> DB",
      "    DB --> SCHED",
      "    SCHED --> PUB",
      "    PUB --> MQ",
      "    MQ --> DISPATCH",
      "    DISPATCH --> PS",
      "    PS --> P",
      "    P --> BIND",
      "    BIND --> DB",
      "    P -->|\"update · offline · commit\"| TS",
      "    REG <--> PS",
      "    FSR -->|\"gRPC Mount / Unmount\"| FS",
      "    EVENTS --> TS",
      "    TS -->|\"任务取消事件\"| EVENTS",
      "    EVENTS --> P",
      "    TS -->|\"取消 WebSocket（过渡期）\"| P",
      "```",
      "",
      "后言",
    ].join("\n");
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();
    await flushPromises();
    await settleUi();

    const diagram = wrapper.get(".cm-special-preview-diagram");
    expect(diagram.find(".mermaid svg").exists()).toBe(true);
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    const renderCall = mermaidMock.render.mock.calls[0] as unknown as [string, string] | undefined;
    expect(renderCall?.[1]).toContain("subgraph TS");

    await diagram.get(".mermaid svg").trigger("dblclick");
    await nextTick();
    expect(document.body.querySelector(".diagram-viewer-overlay")).not.toBeNull();
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();

    wrapper.unmount();
    expect(document.body.querySelector(".diagram-viewer-overlay")).toBeNull();
  });

  it("falls back to the normal code preview when Mermaid rendering is disabled", async () => {
    mermaidMock.render.mockClear();
    const wrapper = mountEditor([
      "before",
      "",
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
    ].join("\n"), {
      extensions: { ...defaultEditorSettings.extensions, mermaid: false },
    });
    await settleUi();

    expect(wrapper.find(".cm-special-preview-diagram").exists()).toBe(false);
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(true);
    expect(mermaidMock.render).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders all find matches and marks the active result", async () => {
    const wrapper = mountEditor("alpha beta alpha");
    await wrapper.setProps({
      findMatches: [{ index: 0, length: 5 }, { index: 11, length: 5 }],
      activeFindIndex: 1,
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".cm-find-match")).toHaveLength(2);
    expect(wrapper.findAll(".cm-find-match-active")).toHaveLength(1);
    wrapper.unmount();
  });

  it("does not intercept composition keys from Chinese input methods", async () => {
    const wrapper = mountEditor("正文");
    await wrapper.vm.$nextTick();
    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    wrapper.get(".cm-content").element.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps tables directly editable and routes table commands to the active cell editor", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".visual-table-editor").exists()).toBe(true);

    await wrapper.get("tbody td").trigger("mousedown");
    await wrapper.vm.$nextTick();
    const cell = wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]');
    await cell.setValue("changed");
    const editor = wrapper.vm as unknown as {
      runCommand: (command: "addTableRowBelow" | "undo" | "redo") => void;
    };
    const toolbarTarget = document.createElement("button");
    toolbarTarget.className = "app-toolbar";
    document.body.append(toolbarTarget);
    toolbarTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    toolbarTarget.focus();
    await settleUi();
    expect(wrapper.get(".visual-table-editor").classes()).toContain("active");
    expect(cell.element.style.display).not.toBe("none");
    editor.runCommand("addTableRowBelow");
    await settleUi();
    editor.runCommand("undo");
    await settleUi();

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates.some(([value]) => value.includes("changed"))).toBe(true);
    expect(updates.at(-1)?.[0]).toContain("changed");
    expect(updates.at(-1)?.[0].split("\n").filter((line) => /^\|/.test(line))).toHaveLength(3);
    editor.runCommand("redo");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]
      .split("\n").filter((line) => /^\|/.test(line))).toHaveLength(4);
    toolbarTarget.remove();
    wrapper.unmount();
  });

  it("keeps edits in cells A, B, and A as three ordered undo groups", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await settleUi();
    await wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]').setValue("one-a");
    await wrapper.findAll("tbody td")[1].trigger("mousedown");
    await settleUi();
    await wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="1"]').setValue("two-b");
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await settleUi();
    await wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]').setValue("one-aa");

    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| one-a | two-b |");
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| one-a | two |");
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| one | two |");
    wrapper.unmount();
  });

  it("inserts a row immediately below the header when the header is active", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("thead th").trigger("mousedown");
    await settleUi();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    editor.runCommand("addTableRowBelow");
    await settleUi();
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    const tableLines = latest.split("\n").filter((line) => /^\|/.test(line));
    expect(tableLines).toEqual(["| A | B |", "| --- | --- |", "|  |  |", "| one | two |"]);
    wrapper.unmount();
  });

  it("uses the saved table-cell selection for copy and asynchronous paste", async () => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue("changed"),
    };
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const cell = wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]');
    cell.element.setSelectionRange(0, cell.element.value.length);
    cell.element.dispatchEvent(new Event("select", { bubbles: true }));
    const toolbar = document.createElement("button");
    toolbar.className = "app-toolbar";
    document.body.append(toolbar);
    toolbar.focus();
    await settleUi();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    editor.runCommand("copyMarkdown");
    await settleUi();
    expect(clipboard.writeText).toHaveBeenCalledWith("one");
    editor.runCommand("pastePlainText");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| changed | two |");

    toolbar.remove();
    wrapper.unmount();
    if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  });

  it("returns focus to CodeMirror on table Escape and lets the next Tab leave", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const cell = wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]');

    await cell.trigger("keydown", { key: "Escape" });
    await nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    expect(document.activeElement).toBe(content);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("clears a retained table target when a toolbar menu is cancelled elsewhere", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    await editor.selectRange(0, 6);
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();

    const toolbar = document.createElement("button");
    toolbar.className = "app-toolbar";
    const outside = document.createElement("button");
    document.body.append(toolbar, outside);
    toolbar.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    toolbar.focus();
    await settleUi();
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.focus();
    await settleUi();

    editor.runCommand("bold");
    await settleUi();
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(latest).toContain("**before**");
    expect(latest).toContain("| one | two |");
    toolbar.remove();
    outside.remove();
    wrapper.unmount();
  });

  it("does not apply unsupported active-table commands to the stale CodeMirror selection", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    await editor.selectRange(0, 6);
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const updatesBefore = wrapper.emitted("update:modelValue")?.length ?? 0;

    editor.runCommand("image");
    await nextTick();
    expect(wrapper.emitted("update:modelValue")?.length ?? 0).toBe(updatesBefore);
    expect(wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]').element.value)
      .toBe("one");
    wrapper.unmount();
  });

  it("moves the caret to a deleted table and restores CodeMirror focus", async () => {
    const prefix = "before\n\n";
    const wrapper = mountEditor(`${prefix}| A | B |\n| --- | --- |\n| one | two |\n`);
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const editor = wrapper.vm as unknown as {
      runCommand: (command: EditorCommand) => void;
      insertText: (text: string) => void;
      getViewState: () => { anchor: number; head: number; scrollTop: number };
    };

    editor.runCommand("deleteTable");
    await settleUi();
    expect(wrapper.find(".visual-table-editor").exists()).toBe(false);
    expect(editor.getViewState().anchor).toBe(prefix.length);
    expect(document.activeElement).toBe(wrapper.get(".cm-content").element);
    editor.insertText("continued");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual([`${prefix}continued`]);
    wrapper.unmount();
  });

  it("clamps and refocuses the active cell after undo removes a new row", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };
    editor.runCommand("addTableRowBelow");
    await settleUi();
    expect((document.activeElement as HTMLElement | null)?.dataset.tableRow).toBe("2");

    editor.runCommand("undo");
    await settleUi();
    const active = document.activeElement as HTMLTextAreaElement | null;
    expect(active?.dataset.tableRow).toBe("1");
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    active!.value = "continued";
    active!.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("continued");
    wrapper.unmount();
  });

  it("routes formatting shortcuts from a table cell to the visual table model", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await wrapper.vm.$nextTick();
    const cell = wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]');
    cell.element.setSelectionRange(0, cell.element.value.length);
    await cell.trigger("keydown", { key: "b", ctrlKey: true });
    await wrapper.vm.$nextTick();

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates.at(-1)?.[0]).toContain("**one**");
    wrapper.unmount();
  });

  it("does not typewriter-center the stale CodeMirror selection during table input", async () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const source = "before\n\n| A | B |\n| --- | --- |\n| one | two |\n";
    const baselineWrapper = mountEditor(source);
    await baselineWrapper.vm.$nextTick();
    await baselineWrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    requestFrame.mockClear();
    await baselineWrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]')
      .setValue("baseline");
    const measurementFrames = requestFrame.mock.calls.length;
    baselineWrapper.unmount();

    requestFrame.mockClear();
    const wrapper = mountEditor(source, { typewriterMode: true, typewriterCenter: true });
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    requestFrame.mockClear();

    await wrapper.get<HTMLTextAreaElement>('textarea[data-table-row="1"][data-table-column="0"]').setValue("changed");
    expect(requestFrame).toHaveBeenCalledTimes(measurementFrames);
    wrapper.unmount();
  });

  it("lets Escape followed by Tab leave the CodeMirror tab handler", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.focus();
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    const escapedTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(escapedTab);
    expect(escapedTab.defaultPrevented).toBe(false);

    const regularTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(regularTab);
    expect(regularTab.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it("opens table links exactly once from click and always blocks WebView navigation", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| [guide](https://example.com) | two |\n");
    await wrapper.vm.$nextTick();
    const anchor = wrapper.get<HTMLAnchorElement>(".cell-rendered a").element;
    anchor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, ctrlKey: true }));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    anchor.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(wrapper.emitted("openLinkHref")).toEqual([["https://example.com"]]);
    wrapper.unmount();
  });

  it("replaces delayed images by placeholder without changing their original order", async () => {
    const wrapper = mountEditor("start");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      reserveImageInsertion: () => string | null;
      replaceImagePlaceholder: (placeholder: string, src: string | null, alt?: string) => boolean;
      insertText: (text: string) => void;
    };
    await editor.selectRange(5, 5);
    const first = editor.reserveImageInsertion();
    const second = editor.reserveImageInsertion();
    if (!first || !second) throw new Error("编辑器未创建图片占位符");
    editor.insertText("continued");

    expect(editor.replaceImagePlaceholder(second, "assets/two.png", "two.png")).toBe(true);
    expect(editor.replaceImagePlaceholder(first, "assets/one.png", "one.png")).toBe(true);
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(latest.indexOf("![one.png](assets/one.png)")).toBeLessThan(latest.indexOf("![two.png](assets/two.png)"));
    expect(latest.indexOf("![two.png](assets/two.png)")).toBeLessThan(latest.indexOf("continued"));
    expect(latest).not.toContain("marko-image-");
    wrapper.unmount();
  });

  it("keeps the selected text intact when a reserved image insertion fails", async () => {
    const wrapper = mountEditor("selected");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      reserveImageInsertion: () => string | null;
      replaceImagePlaceholder: (placeholder: string, src: string | null) => boolean;
    };
    await editor.selectRange(0, 8);
    const placeholder = editor.reserveImageInsertion();
    if (!placeholder) throw new Error("编辑器未创建图片占位符");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe(`selected${placeholder}`);

    expect(editor.replaceImagePlaceholder(placeholder, null)).toBe(true);
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual(["selected"]);
    wrapper.unmount();
  });

  it("handles an editor image drop once and emits its placeholder before file reading", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const parent = wrapper.element.parentElement!;
    const bubbled = vi.fn();
    parent.addEventListener("drop", bubbled);
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });

    wrapper.get(".cm-content").element.dispatchEvent(drop);
    await nextTick();

    expect(drop.defaultPrevented).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    const request = wrapper.emitted("imageData")?.[0]?.[0] as { file: File; placeholder: string };
    expect(request.file).toBe(file);
    expect(request.placeholder).toContain("marko-image-");
    parent.removeEventListener("drop", bubbled);
    wrapper.unmount();
  });

  it("navigates Emoji suggestions with the keyboard and accepts the active option", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as { insertText: (text: string) => void };
    editor.insertText(":w");
    await settleUi();

    const content = wrapper.get<HTMLElement>(".cm-content").element;
    const options = wrapper.findAll(".emoji-option");
    expect(options).toHaveLength(2);
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await nextTick();
    expect(options[1].attributes("aria-selected")).toBe("true");
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await nextTick();

    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("⚠️");
    expect(wrapper.find(".emoji-popover").exists()).toBe(false);
    wrapper.unmount();
  });

  it("opens escape-triggered Emoji suggestions once and then lets Escape-Tab leave", async () => {
    const wrapper = mountEditor("text", { emojiAutocomplete: "escape" });
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as { insertText: (text: string) => void };
    editor.insertText(":w");
    await nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    expect(wrapper.find(".emoji-popover").exists()).toBe(false);

    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(wrapper.find(".emoji-popover").exists()).toBe(true);
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(wrapper.find(".emoji-popover").exists()).toBe(false);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("opens the editor menu from the keyboard and restores focus after Escape", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.focus();
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    const items = wrapper.findAll<HTMLButtonElement>(".editor-context-menu [role='menuitem']");
    expect(items.length).toBeGreaterThan(2);
    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(items.at(-1)?.element);
    await items.at(-1)!.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(wrapper.find(".editor-context-menu").exists()).toBe(false);
    expect(document.activeElement).toBe(content);
    wrapper.unmount();
  });

  it("renders inactive list markers while keeping the active line in Markdown source", async () => {
    const wrapper = mountEditor("- first\n1. second");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange("- first\n1. second".length, "- first\n1. second".length);
    await settleUi();

    const markers = wrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    expect(markers).toHaveLength(1);
    expect(markers[0].element.textContent).toBe("• ");
    expect(wrapper.get(".cm-content").text()).toContain("1. second");
    wrapper.unmount();
  });
});
