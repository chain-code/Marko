// 图片上传（M-4）：S-9 配了上传方式时，插入的图片先上传，用返回的网址。请求由主进程发出：
// - 上传接口：表单 POST（字段 file），Token 放在 Authorization 请求头（同旧版）；返回的 JSON 里取 url、link、data.url，不是 JSON 就用整段文字；
// - 自定义命令：运行设置里的命令，图片路径加在后面，命令输出里最后一个网址就是上传后的地址（同 Typora 的自定义命令上传）
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { t } from "./i18n.ts";

/** 等多久（上传大图、命令里联网都要时间） */
const TIMEOUT = 60_000;

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: FormData; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** 接口返回的地址：JSON 里的 url、link、data.url，否则整段文字 */
export function urlFromResponse(text: string): string {
  try {
    const json = JSON.parse(text) as { url?: unknown; link?: unknown; data?: { url?: unknown } };
    for (const value of [json.url, json.link, json.data?.url]) if (typeof value === "string" && value) return value;
  } catch {
    // 不是 JSON
  }
  return text.trim();
}

export async function uploadToApi(file: string, endpoint: string, token: string | null, fetchImpl: FetchLike): Promise<string> {
  if (!endpoint.trim()) throw new Error(t("error.uploadNoEndpoint"));
  const form = new FormData();
  form.append("file", new Blob([await readFile(file)]), basename(file));
  const response = await fetchImpl(endpoint.trim(), {
    method: "POST",
    headers: token ? { Authorization: token } : {},
    body: form,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) throw new Error(t("error.uploadHttp", { status: response.status }));
  const url = urlFromResponse(await response.text());
  if (!/^https?:\/\//i.test(url)) throw new Error(t("error.uploadNoUrl"));
  return url;
}

/** 命令行里的一个参数：按平台加引号 */
function quoted(value: string): string {
  if (process.platform === "win32") return `"${value.replace(/"/g, '""')}"`;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** 命令输出里最后一个网址 */
export function urlFromOutput(output: string): string | null {
  const urls = output.match(/https?:\/\/[^\s"'<>]+/gi);
  return urls?.length ? urls[urls.length - 1] : null;
}

export function uploadWithCommand(file: string, command: string): Promise<string> {
  if (!command.trim()) return Promise.reject(new Error(t("error.uploadNoCommand")));
  return new Promise((resolve, reject) => {
    // 命令是用户自己填的（同在终端里运行），交给系统的命令行解释；图片路径加引号接在后面
    const child = spawn(`${command.trim()} ${quoted(file)}`, { shell: true, windowsHide: true });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(t("error.uploadTimeout")));
    }, TIMEOUT);
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (errors += chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const url = urlFromOutput(output);
      if (code === 0 && url) resolve(url);
      else
        reject(
          new Error(
            code === 0
              ? t("error.uploadCommandNoUrl")
              : t("error.uploadCommandFailed", { code: String(code), message: (errors || output).trim().split(/\r?\n/).pop() ?? "" }),
          ),
        );
    });
  });
}
