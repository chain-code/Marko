// 撤销、重做以后的出身（E-6：撤销到底回到打开时的原文，逐字节不变）。
// ProseMirror 撤销时把步骤反着做一遍：改动边上的块是重新拼出来的新对象，没有原来的出身，块前空行、行前缀只能重新生成。
// 这里按撤销记录记下每个记录开始之前的文档（文档不可变，大部分节点和当前文档共用，记下来几乎不占地方）；
// 撤销、重做以后文档和记下的那个结构相同时，把那个文档里各节点的出身按位置一一抄过来。
// 前提：已经在文档里的节点，出身对象不再改（要改时换成新节点，见 state.ts 的 renewOrigin）
import { getOrigin, setOrigin } from "@marko/markdown";
import { isHistoryTransaction, redoDepth, undoDepth } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { forgetModel } from "../state.ts";

/** 每个撤销记录开始之前（done）、每个重做记录开始之前（undone）的文档，和 ProseMirror 历史里的记录一一对应 */
export class HistoryDocs {
  private done: Array<PMNode | null> = [];
  private undone: Array<PMNode | null> = [];

  /**
   * 一批事务（根事务和插件追加的）开始处理时调用一次：oldState 是这批之前的状态，newState 是根事务之后的。
   * 撤销、重做时返回应该恢复成的文档
   */
  track(root: Transaction, oldState: EditorState, newState: EditorState): PMNode | null {
    const before = undoDepth(oldState);
    const after = undoDepth(newState);
    let expected: PMNode | null = null;
    if (isHistoryTransaction(root)) {
      // 撤销、重做不会超出历史的上限（总记录数不变），个数正好差一
      if (after < before) {
        expected = this.done.pop() ?? null;
        this.undone.push(oldState.doc);
      } else if (after > before) {
        expected = this.undone.pop() ?? null;
        this.done.push(oldState.doc);
      }
    } else if (after !== before) {
      // 开始了一个新的撤销记录（超出上限时 ProseMirror 同时丢掉最早的一批，下面对齐）
      this.done.push(oldState.doc);
    }
    this.align(newState);
    return expected;
  }

  /** 和历史里的记录个数对齐：多了丢掉最早的，少了（比如换过状态）在前面补空 */
  align(state: EditorState): void {
    trim(this.done, undoDepth(state));
    trim(this.undone, redoDepth(state));
  }
}

function trim(list: Array<PMNode | null>, length: number): void {
  if (list.length > length) list.splice(0, list.length - length);
  while (list.length < length) list.unshift(null);
}

/** 结构相同的两个文档：把 from 里各节点的出身抄到 to 里对应的节点上。同一个对象的子树本来就一样，跳过 */
export function restoreOrigins(from: PMNode, to: PMNode): void {
  if (from === to) return;
  const origin = getOrigin(from);
  setOrigin(to, origin ? { ...origin } : undefined);
  forgetModel(to);
  if (to.isTextblock || to.isLeaf) return;
  for (let index = 0; index < to.childCount; index += 1) restoreOrigins(from.child(index), to.child(index));
}
