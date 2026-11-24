// 给节点装上 NodeView（1.6 节）：代码类的块是 CodeMirror（nodeViews/codeMirror.ts），脚注定义、目录（nodeViews/blocks.ts）。
// 节点本身（schema）在 nodes/index.ts；这里另外包一层，测试只要 schema 时不用带上 CodeMirror
import type { AnyExtension, Editor, NodeViewRendererProps } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { isMathFenceInfo } from "@marko/render";
import type { EditorHost } from "../host.ts";
import { FootnoteDefinitionView, TocView } from "./blocks.ts";
import { CodeBlockView, DiagramView, type DiagramPainter } from "./codeBlock.ts";
import type { CodeKeys, CodeMirrorViewProps } from "./codeMirror.ts";
import { FrontMatterView, HtmlBlockView, MathBlockView } from "./rawBlocks.ts";

export { refreshCodeViews, type CodeKeys } from "./codeMirror.ts";

/** 有 CodeMirror 的节点（ProseMirror 里方向键要能进去，keymap.ts） */
export const CODE_VIEW_NODES = new Set(["codeBlock", "diagram", "mathBlock", "htmlBlock", "frontMatter"]);

export interface NodeViewOptions {
  keys: CodeKeys;
  host: (editor: Editor) => EditorHost & { renderDiagram?: DiagramPainter };
}

export function withNodeViews(nodes: AnyExtension[], options: NodeViewOptions): AnyExtension[] {
  const props = (input: NodeViewRendererProps): CodeMirrorViewProps => ({
    editor: input.editor,
    node: input.node,
    view: input.view,
    getPos: input.getPos,
    keys: options.keys,
  });
  return nodes.map((extension) => {
    if (!(extension instanceof Node)) return extension;
    switch (extension.name) {
      case "codeBlock":
        // 信息串是 math 的代码块（GitLab 的写法）按公式块显示，同导出（B-7）
        return extension.extend({
          addNodeView: () => (input) =>
            isMathFenceInfo(input.node.attrs) && input.editor.storage.marko.syntax.math ? new MathBlockView(props(input)) : new CodeBlockView(props(input)),
        });
      case "diagram":
        return extension.extend({
          addNodeView: () => (input) => {
            const host = options.host(input.editor);
            return new DiagramView(props(input), host.renderDiagram ? host.renderDiagram.bind(host) : null);
          },
        });
      case "mathBlock":
        return extension.extend({ addNodeView: () => (input) => new MathBlockView(props(input)) });
      case "htmlBlock":
        return extension.extend({ addNodeView: () => (input) => new HtmlBlockView(props(input), () => options.host(input.editor)) });
      case "frontMatter":
        return extension.extend({ addNodeView: () => (input) => new FrontMatterView(props(input)) });
      case "footnoteDefinition":
        return extension.extend({ addNodeView: () => (input) => new FootnoteDefinitionView(input) });
      case "toc":
        return extension.extend({ addNodeView: () => (input) => new TocView(input) });
      default:
        return extension;
    }
  });
}
