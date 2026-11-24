// 全局搜索（W-5）：调 ripgrep（@vscode/ripgrep，同 Typora）。只搜文件树里列的那些文件：工作区里的 Markdown 文件，
// 以 . 开头的、node_modules 不搜，不看 .gitignore。结果按文件攒着，每 100ms 推一批给窗口；匹配太多时停在前 LIMIT 处
import { spawn, type ChildProcess } from "node:child_process";
import { normalize } from "node:path";
import { createInterface } from "node:readline";
import { rgPath } from "@vscode/ripgrep";
import type { WebContents } from "electron";
import { EVENTS, type SearchFileResult, type SearchMatch, type SearchRequest } from "@marko/shared";
import { MARKDOWN_EXTENSIONS } from "./workspace.ts";

/** 最多列这么多处匹配 */
export const LIMIT = 2_000;
/** 一个文件最多列这么多行 */
const PER_FILE = 200;
/** 片段最长多少字；超过时截取第一个匹配附近，匹配前面留 CONTEXT 个字 */
const PREVIEW = 160;
const CONTEXT = 40;

/** 打包后 ripgrep 解在 asar 外面（electron-builder 的 asarUnpack） */
const RG = rgPath.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");

export function ripgrepArgs(request: Pick<SearchRequest, "root" | "query" | "caseSensitive" | "wholeWord" | "regexp">): string[] {
  return [
    "--json",
    "--no-ignore",
    "--no-messages",
    "--max-filesize",
    "20M",
    "--max-count",
    String(PER_FILE),
    request.caseSensitive ? "--case-sensitive" : "--ignore-case",
    ...(request.wholeWord ? ["--word-regexp"] : []),
    // 正则：大多数写法同查找栏（JavaScript）；要环视、反向引用时 ripgrep 自动换 PCRE2
    ...(request.regexp ? ["--engine", "auto"] : ["--fixed-strings"]),
    ...MARKDOWN_EXTENSIONS.flatMap((extension) => ["--iglob", `*${extension}`]),
    "--glob",
    "!node_modules",
    "--regexp",
    request.query,
    "--",
    request.root,
  ];
}

interface RipgrepText {
  text?: string;
  bytes?: string;
}

function bufferOf(value: RipgrepText): Buffer {
  return value.text !== undefined ? Buffer.from(value.text, "utf8") : Buffer.from(value.bytes ?? "", "base64");
}

/** ripgrep 给的是字节偏移：换成字符偏移（JavaScript 字符串的下标） */
function charOffset(buffer: Buffer, byte: number): number {
  return buffer.subarray(0, byte).toString("utf8").length;
}

/** 一行和它里面的匹配（字符偏移）→ 显示的片段：去掉行尾换行、行首空白，太长时截取第一个匹配附近 */
export function previewOf(line: string, ranges: Array<[number, number]>): Pick<SearchMatch, "preview" | "ranges"> {
  const text = line.replace(/\r?\n$/, "");
  const leading = text.length - text.trimStart().length;
  const first = ranges[0]?.[0] ?? leading;
  let start = Math.min(leading, first);
  let end = text.length;
  if (end - start > PREVIEW) {
    start = Math.max(start, first - CONTEXT);
    end = Math.min(text.length, start + PREVIEW);
  }
  const prefix = start > leading ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const shift = prefix.length - start;
  return {
    preview: prefix + text.slice(start, end) + suffix,
    ranges: ranges
      .filter(([from, to]) => to > start && from < end)
      .map(([from, to]): [number, number] => [Math.max(from, start) + shift, Math.min(to, end) + shift]),
  };
}

interface RipgrepMatch {
  path: RipgrepText;
  lines: RipgrepText;
  line_number: number;
  submatches: Array<{ start: number; end: number }>;
}

/** ripgrep 的一条 match 消息 → 一处匹配 */
export function matchOf(data: RipgrepMatch): SearchMatch {
  const buffer = bufferOf(data.lines);
  const ranges = data.submatches.map(({ start, end }): [number, number] => [charOffset(buffer, start), charOffset(buffer, end)]);
  const [column, to] = ranges[0] ?? [0, 0];
  return { line: data.line_number, column, length: to - column, ...previewOf(buffer.toString("utf8"), ranges) };
}

// ---------------------------------------------------------------------------

interface Running {
  id: number;
  child: ChildProcess;
}

/** 每个窗口同时只有一个搜索 */
const running = new Map<number, Running>();
/** 已经挂上「窗口没了就停掉搜索」的 */
const tracked = new Set<number>();

function stop(contentsId: number, id?: number): void {
  const current = running.get(contentsId);
  if (!current || (id !== undefined && current.id !== id)) return;
  running.delete(contentsId);
  current.child.kill();
}

export function cancelSearch(contents: WebContents, id: number): void {
  stop(contents.id, id);
}

export function startSearch(contents: WebContents, request: SearchRequest): void {
  const contentsId = contents.id;
  stop(contentsId);
  const child = spawn(RG, ripgrepArgs(request), { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const entry: Running = { id: request.id, child };
  running.set(contentsId, entry);
  if (!tracked.has(contentsId)) {
    tracked.add(contentsId);
    contents.once("destroyed", () => {
      tracked.delete(contentsId);
      stop(contentsId);
    });
  }

  const send = (channel: string, payload: unknown) => {
    if (!contents.isDestroyed() && running.get(contentsId) === entry) contents.send(channel, payload);
  };
  let pending: SearchFileResult[] = [];
  let current: SearchFileResult | null = null;
  let total = 0;
  let files = 0;
  let truncated = false;
  let stderr = "";
  const flush = () => {
    if (!pending.length) return;
    send(EVENTS.searchResults, { id: request.id, files: pending });
    pending = [];
  };
  const timer = setInterval(flush, 100);

  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderr.length < 4_000) stderr += chunk.toString("utf8");
  });
  const lines = createInterface({ input: child.stdout! });
  lines.on("line", (line) => {
    if (truncated) return;
    let message: { type: string; data: RipgrepMatch & { path: RipgrepText } };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === "begin") {
      // 和文件树里的路径写法一样（Windows 上统一成反斜杠）
      current = { path: normalize(bufferOf(message.data.path).toString("utf8")), matches: [] };
    } else if (message.type === "match" && current) {
      current.matches.push(matchOf(message.data));
      total += 1;
      if (total >= LIMIT) {
        truncated = true;
        pending.push(current);
        current = null;
        child.kill();
      }
    } else if (message.type === "end" && current) {
      // ripgrep 一个文件最多给 PER_FILE 行（--max-count）：给满了就是后面还有
      if (current.matches.length >= PER_FILE) current.truncated = true;
      if (current.matches.length) pending.push(current);
      files += 1;
      current = null;
    }
  });
  child.on("error", (error) => {
    clearInterval(timer);
    send(EVENTS.searchDone, { id: request.id, truncated: false, error: error.message });
    if (running.get(contentsId) === entry) running.delete(contentsId);
  });
  child.on("close", (code) => {
    clearInterval(timer);
    lines.close();
    flush();
    // 退出码 2：出错。读不了的文件不报（--no-messages），这时 stderr 里有的是正则写错了这类，报最后一句给用户
    const message = stderr
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter((text) => text && !/^~+$/.test(text));
    const error = code === 2 && message.length && !truncated && files === 0 ? message[message.length - 1] : undefined;
    send(EVENTS.searchDone, { id: request.id, truncated, ...(error ? { error } : {}) });
    if (running.get(contentsId) === entry) running.delete(contentsId);
  });
}
