// 行表：按 "\n" 分行（解析前已把单独的 "\r" 换成 "\n"，长度不变），行尾的 "\r" 不算内容

export class LineIndex {
  readonly text: string;
  readonly starts: number[];

  constructor(text: string) {
    this.text = text;
    const starts = [0];
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
    this.starts = starts;
  }

  get count(): number {
    return this.starts.length;
  }

  /** 偏移所在的行；行尾的 "\n" 算这一行的 */
  lineOf(offset: number): number {
    const starts = this.starts;
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  start(line: number): number {
    return this.starts[line];
  }

  /** 这一行内容的结尾：不含 "\r\n"、"\n" */
  end(line: number): number {
    const next = line + 1 < this.starts.length ? this.starts[line + 1] - 1 : this.text.length;
    return next > this.starts[line] && this.text.charCodeAt(next - 1) === 13 ? next - 1 : next;
  }

  /** 这一行的内容 */
  line(line: number): string {
    return this.text.slice(this.start(line), this.end(line));
  }
}

/** 单独的 "\r" 也是换行（CommonMark），换成 "\n" 交给 Lezer；"\r\n" 不动，长度不变 */
export function normalizeLoneCarriageReturns(text: string): string {
  return text.includes("\r") ? text.replace(/\r(?!\n)/g, "\n") : text;
}

/** 出现最多的换行符；没有换行时返回 null */
export function dominantEol(text: string): "\n" | "\r\n" | "\r" | null {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf += 1;
        i += 1;
      } else cr += 1;
    } else if (code === 10) lf += 1;
  }
  if (crlf === 0 && lf === 0 && cr === 0) return null;
  if (crlf >= lf && crlf >= cr) return "\r\n";
  return lf >= cr ? "\n" : "\r";
}

/** 列宽：制表符按 4 列对齐，从 startColumn 开始数 */
export function countColumns(text: string, from: number, to: number, startColumn = 0): number {
  let column = startColumn;
  for (let i = from; i < to; i += 1) column += text.charCodeAt(i) === 9 ? 4 - (column % 4) : 1;
  return column;
}

/** 从行首数到第 goal 列所在的位置（同 Lezer 的 Line.findColumn） */
export function findColumn(line: string, goal: number): number {
  let i = 0;
  for (let column = 0; i < line.length && column < goal; i += 1) {
    column += line.charCodeAt(i) === 9 ? 4 - (column % 4) : 1;
  }
  return i;
}
