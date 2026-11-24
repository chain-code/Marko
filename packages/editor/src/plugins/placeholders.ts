// M-2、M-7：插入图片、视频、音频（粘贴、拖进来、「插入本地图片」）。宿主保存或上传期间在插入的位置先放一个占位
// （装饰，不在文档里，跟着编辑映射位置），完成后在占位的位置写进 `![名字](地址)`（视频、音频写 `<video controls>`、
// `<audio controls>`）；失败时去掉占位、交给宿主提示原因
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { textsOf } from "../texts.ts";

interface PlaceholderMeta {
  add?: { id: string; pos: number; label: string };
  remove?: string;
}

export const placeholdersKey = new PluginKey<DecorationSet>("markoPlaceholders");

/** 占位现在的位置（占位被删掉了时为 null） */
export function placeholderPosition(state: EditorState, id: string): number | null {
  const found = placeholdersKey.getState(state)?.find(undefined, undefined, (spec) => (spec as { id?: string }).id === id);
  return found?.length ? found[0].from : null;
}

/** 地址里有空格、括号时用尖括号包起来（CommonMark 的写法），否则原样 */
export function markdownUrl(url: string): string {
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, (char) => encodeURIComponent(char))}>` : url;
}

let counter = 0;

export type MediaKind = "image" | "video" | "audio";

/** 文件的媒体种类（按 MIME 类型）；不是图片、视频、音频时为 null */
export function mediaKindOf(type: string): MediaKind | null {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return null;
}

/** 要插入的一个媒体：save 由宿主保存（M-3）或上传（M-4），给出写进文档的地址；null 表示不插入了 */
export interface MediaInsert {
  name: string;
  kind: MediaKind;
  save(): Promise<string | { url: string; alt?: string } | null>;
}

/** 写进文档的写法：图片是 Markdown 图片；视频、音频是带控件的 HTML（M-7，编辑区里可以直接播放） */
function mediaMarkup(kind: MediaKind, url: string, alt: string): string {
  if (kind === "image") return `![${alt}](${markdownUrl(url)})`;
  const src = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<${kind} controls src="${src}"></${kind}>`;
}

/** 插入几个媒体到 pos（不给时是光标处）：先放占位，宿主保存、上传完了以后在占位的位置写进地址 */
export async function insertMedia(editor: Editor, items: MediaInsert[], pos?: number): Promise<void> {
  const host = editor.storage.marko.host;
  await Promise.all(
    items.map(async (item) => {
      counter += 1;
      const id = `media-${Date.now()}-${counter}`;
      const at = Math.min(pos ?? editor.state.selection.from, editor.state.doc.content.size);
      editor.view.dispatch(editor.state.tr.setMeta(placeholdersKey, { add: { id, pos: at, label: item.name } } satisfies PlaceholderMeta).setMeta("addToHistory", false));
      try {
        const saved = await item.save();
        const where = placeholderPosition(editor.state, id);
        const tr = editor.state.tr.setMeta(placeholdersKey, { remove: id } satisfies PlaceholderMeta);
        // 宿主说不插入了（null）：只去掉占位
        if (saved !== null && where !== null && !editor.isDestroyed) {
          const url = typeof saved === "string" ? saved : saved.url;
          // 替代文字：宿主给了就用（K-1 的 replaceImagePlaceholder 可以带），否则用文件名
          const alt = ((typeof saved === "string" ? "" : saved.alt) || item.name.replace(/\.[^.]+$/, "")).replace(/[[\]]/g, "");
          const markup = mediaMarkup(item.kind, url, alt);
          const $where = tr.doc.resolve(where);
          if ($where.parent.isTextblock) tr.insertText(markup, where);
          else tr.insert(where, editor.schema.nodes.paragraph.create(null, editor.schema.text(markup)));
        }
        if (!editor.isDestroyed) editor.view.dispatch(tr);
      } catch (error) {
        if (editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr.setMeta(placeholdersKey, { remove: id } satisfies PlaceholderMeta).setMeta("addToHistory", false));
        host.reportError?.(textsOf(host).insertFailed(item.kind, item.name, error instanceof Error ? error.message : String(error)));
      }
    }),
  );
}

/** 把图片、视频、音频文件插到 pos（粘贴、拖进来的）：交给宿主的 saveImage 保存 */
export async function insertImageFiles(editor: Editor, files: File[], pos?: number): Promise<void> {
  const host = editor.storage.marko.host;
  const items: MediaInsert[] = [];
  for (const file of files) {
    const kind = mediaKindOf(file.type);
    const name = file.name || "image.png";
    if (kind) items.push({ name, kind, save: () => host.saveImage(file, name) });
  }
  await insertMedia(editor, items, pos);
}

export const Placeholders = Extension.create({
  name: "markoPlaceholders",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<DecorationSet>({
        key: placeholdersKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(placeholdersKey) as PlaceholderMeta | undefined;
            if (meta?.add) {
              const element = document.createElement("span");
              element.className = "md-image-placeholder";
              element.contentEditable = "false";
              element.textContent = meta.add.label;
              next = next.add(tr.doc, [Decoration.widget(meta.add.pos, element, { id: meta.add.id, side: 1, ignoreSelection: true })]);
            }
            if (meta?.remove) next = next.remove(next.find(undefined, undefined, (spec) => (spec as { id?: string }).id === meta.remove));
            return next;
          },
        },
        props: {
          decorations: (state) => placeholdersKey.getState(state),
          // 拖进来的图片、视频、音频文件（M-2、M-7）；编辑器里拖动的文字（C-5）、别的文件交给 ProseMirror 和应用
          handleDrop(view, event, _slice, moved) {
            if (moved || !view.editable) return false;
            const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => mediaKindOf(file.type) !== null);
            if (!files.length) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            void insertImageFiles(editor, files, pos);
            return true;
          },
        },
      }),
    ];
  },
});
