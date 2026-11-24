// F-15：把 Markdown 文件、文件夹拖到窗口上打开（文件夹作为工作区，文件按 F-3）；图片、视频、音频拖到编辑区由编辑器自己插入。
// 拖动时显示提示：「松开以打开」「松开以插入」（拖动时只看得到类型，看不到文件名：全是图片、视频、音频且在编辑区上时是插入）
import type { DroppedResult, MarkoApi, Result } from "@marko/shared";
import { onBeforeUnmount, onMounted, ref } from "vue";

export type DropHint = "open" | "insert";

const MEDIA = /^(image|video|audio)\//;

/** 拖着的东西在这里松开会怎样；不是文件时不管（null） */
export function dropHintOf(types: readonly string[], items: ReadonlyArray<{ kind: string; type: string }>, overEditor: boolean): DropHint | null {
  if (!types.includes("Files")) return null;
  const files = items.filter((item) => item.kind === "file");
  return overEditor && files.length > 0 && files.every((item) => MEDIA.test(item.type)) ? "insert" : "open";
}

/** 多久没有 dragover 就当作拖走了（拖出窗口时不一定有 dragleave） */
const IDLE = 250;

export function useDropOpen(api: MarkoApi, options: { editorRoot(): HTMLElement | null; onResult(result: Result<DroppedResult>): void }) {
  const hint = ref<DropHint | null>(null);
  let idle: ReturnType<typeof setTimeout> | undefined;

  function over(event: DragEvent): void {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const target = event.target instanceof Node ? event.target : null;
    const value = dropHintOf([...transfer.types], [...transfer.items].map((item) => ({ kind: item.kind, type: item.type })), !!target && !!options.editorRoot()?.contains(target));
    if (!value) return;
    // 允许在这里松开（不然浏览器按默认的，打开文件就是跳转到它）
    event.preventDefault();
    transfer.dropEffect = "copy";
    hint.value = value;
    clearTimeout(idle);
    idle = setTimeout(() => (hint.value = null), IDLE);
  }

  async function drop(event: DragEvent): Promise<void> {
    clearTimeout(idle);
    hint.value = null;
    // 编辑区已经处理了（插入了图片这些）
    if (event.defaultPrevented) return;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    options.onResult(await api.file.openDropped(files));
  }

  onMounted(() => {
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
  });
  onBeforeUnmount(() => {
    clearTimeout(idle);
    window.removeEventListener("dragover", over);
    window.removeEventListener("drop", drop);
  });

  return { hint };
}
