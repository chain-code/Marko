// 读写文档（E-1、F-6、F-7、F-18）：识别编码（BOM → jschardet → 按 UTF-8）、原子写入（write-file-atomic）、
// 冲突检测（保存前比对磁盘上内容的指纹和打开时、上次保存时的是否一样）
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import iconv from "iconv-lite";
import jschardet from "jschardet";
import writeFileAtomic from "write-file-atomic";
import type { MarkoError, OpenedDocument, SaveRequest } from "@marko/shared";
import { t } from "./i18n.ts";

export function hashOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** jschardet 认出来的名字 → iconv-lite 的名字；GBK、GB2312 都按 GB18030 读（它是超集） */
function normalizeEncoding(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "ascii" || lower === "utf-8" || lower === "utf8") return "utf-8";
  if (lower === "gb2312" || lower === "gbk" || lower === "gb18030") return "gb18030";
  return lower;
}

/** jschardet 的猜测至少要有这么大的把握 */
const MIN_CONFIDENCE = 0.2;

/** 识别编码：先看 BOM；再看是不是合法的 UTF-8；否则问 jschardet（把握不大时按 UTF-8，uncertain：状态栏提示，F-18） */
export function detectEncoding(bytes: Uint8Array): { encoding: string; bom: boolean; uncertain?: true } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "utf-8", bom: true };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "utf-16le", bom: true };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "utf-16be", bom: true };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "utf-8", bom: false };
  } catch {
    // 不是 UTF-8
  }
  const guess = jschardet.detect(Buffer.from(bytes), { minimumThreshold: MIN_CONFIDENCE });
  // jschardet 把握不大的猜测也会给出来（低于 minimumThreshold）：自己再看一遍
  const encoding = guess.encoding && guess.confidence >= MIN_CONFIDENCE ? normalizeEncoding(guess.encoding) : null;
  if (!encoding || !iconv.encodingExists(encoding)) return { encoding: "utf-8", bom: false, uncertain: true };
  return { encoding, bom: false };
}

/** 指定了编码时（以其他编码重新打开）：这种编码的 BOM 在不在 */
function bomFor(bytes: Uint8Array, encoding: string): boolean {
  if (encoding === "utf-8") return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (encoding === "utf-16le") return bytes[0] === 0xff && bytes[1] === 0xfe;
  if (encoding === "utf-16be") return bytes[0] === 0xfe && bytes[1] === 0xff;
  return false;
}

/** 这个编码能不能用（以其他编码重新打开时检查） */
export function isKnownEncoding(encoding: string): boolean {
  return iconv.encodingExists(encoding);
}

/** 解码：UTF-8 的 BOM 留在文字里（编辑器按它记下 BOM）；UTF-16 的 BOM 去掉，记在 bom 上 */
export function decode(bytes: Uint8Array, encoding: string, bom: boolean): string {
  if (encoding === "utf-8") return Buffer.from(bytes).toString("utf8");
  return iconv.decode(Buffer.from(bytes), encoding, { stripBOM: bom });
}

export function encode(content: string, encoding: string, bom: boolean): Buffer {
  if (encoding === "utf-8") return Buffer.from(content, "utf8");
  return iconv.encode(content, encoding, { addBOM: bom });
}

export async function readDocument(path: string, encoding?: string): Promise<OpenedDocument> {
  const bytes = await readFile(path);
  const detected: { encoding: string; bom: boolean; uncertain?: true } = encoding ? { encoding, bom: bomFor(bytes, encoding) } : detectEncoding(bytes);
  return {
    path,
    content: decode(bytes, detected.encoding, detected.bom),
    encoding: detected.encoding,
    bom: detected.bom,
    hash: hashOf(bytes),
    ...(detected.uncertain ? { uncertainEncoding: true } : {}),
  };
}

/** 磁盘上现在的指纹；文件不在了返回 null */
async function currentHash(path: string): Promise<string | null> {
  try {
    return hashOf(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class ConflictError extends Error {
  readonly markoError: MarkoError = { code: "conflict", message: t("error.conflict") };
}

/** 原子写入：先写临时文件再替换（F-6）。expectedHash 不为 null 时先比对，磁盘上的不一样就报冲突 */
export async function saveDocument(request: SaveRequest): Promise<{ path: string; hash: string }> {
  if (request.expectedHash !== null) {
    const onDisk = await currentHash(request.path);
    if (onDisk !== null && onDisk !== request.expectedHash) throw new ConflictError();
  }
  const bytes = encode(request.content, request.encoding, request.bom);
  await writeFileAtomic(request.path, bytes);
  return { path: request.path, hash: hashOf(bytes) };
}
