// 事务上的 meta（plugins/reconcile.ts 用）

/** 强制对齐整篇（输入法组合结束后、切回排版视图后） */
export const RECONCILE = "markoReconcileAll";

/** 这次不要对齐（对齐自己产生的事务、按源码改动的命令已经对齐过的、需要暂时保留未转换的写法时） */
export const SKIP_RECONCILE = "markoSkipReconcile";

/** 行内装饰整篇重画（语法开关、宿主、显示设置换了；公式的整篇渲染结果变了） */
export const REFRESH_INLINE = "markoRefreshInline";

/** 只重画这几个文本块的行内装饰（值是文档位置；如公式的整篇渲染结果对回了换过对象的块） */
export const REDRAW_BLOCKS = "markoRedrawBlocks";
