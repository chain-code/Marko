// 图表渲染接口（D-3、D-4、1.7 节）：种类 + 源码 + 主题 → SVG。图表库只在沙箱 iframe 里运行（1.2 节），
// 这里负责发请求、按源码缓存、超时、把返回的 SVG 再过滤一遍（1.10 节）。
//
// 和沙箱之间：
// - 沙箱页加载完发一条 { type: "ready" }；宿主收到第一条时建一个 MessageChannel，把一端交给沙箱，之后请求和回复
//   都走这个端口。沙箱要是被（出了漏洞的图表库）导航到别的网页，新页面拿不到端口：收不到后面的图表源码，也冒充不了回复；
// - iframe 第二次触发 load 就是被导航走了：拆掉重建；
// - 渲染器一次只发一个请求，超时从发出时算；超时说明沙箱卡住了，拆掉重建，后面的请求发给新的沙箱。
import { randomHex } from "./random.ts";
import { sanitizeSvg } from "./sanitize.ts";

export type DiagramKind = "mermaid" | "flowchart" | "sequence";
export type DiagramTheme = "light" | "dark";

export interface DiagramRequest {
  /** 渲染器的随机前缀 + 序号：几个渲染器共用一个通道时也认得出是谁的回复 */
  id: string;
  kind: DiagramKind;
  source: string;
  theme: DiagramTheme;
}

export type DiagramResponse = { id: string; svg: string } | { id: string; error: string };

export type DiagramResult = { svg: string; error?: undefined } | { svg?: undefined; error: string };

/** 和沙箱之间的通道；默认实现是 SandboxFrameChannel，测试里可以换成假的 */
export interface DiagramChannel {
  post(request: DiagramRequest): void;
  /** 收到回复时回调；返回取消订阅的函数 */
  listen(listener: (message: unknown) => void): () => void;
  /** 沙箱卡住了（超时）：拆掉重建，发出去还没回的请求按失败回复 */
  restart?(): void;
}

export interface DiagramRendererOptions {
  /** 一张图从发出到回复的上限，默认 15 秒 */
  timeoutMs?: number;
  cacheLimit?: number;
}

/** 沙箱返回的 SVG：过滤一遍；过滤后必须是 <svg> 元素（前面不能有文字），否则当作失败 */
export function cleanDiagramSvg(svg: string): string | null {
  const clean = sanitizeSvg(svg).trim();
  return /^<svg[\s>]/i.test(clean) && /<\/svg>$/i.test(clean) ? clean : null;
}

function cacheKey(kind: DiagramKind, source: string, theme: DiagramTheme): string {
  return `${kind}\n${theme}\n${source}`;
}

function isResponse(message: unknown): message is DiagramResponse {
  return typeof message === "object" && message !== null && typeof (message as { id?: unknown }).id === "string";
}

interface Job {
  request: DiagramRequest;
  resolve(result: DiagramResult): void;
}

const CLOSED: DiagramResult = { error: "图表渲染器已关闭" };

export class DiagramRenderer {
  private readonly channel: DiagramChannel;
  private readonly timeoutMs: number;
  private readonly cacheLimit: number;
  private readonly cache = new Map<string, Promise<DiagramResult>>();
  private readonly queue: Job[] = [];
  private current: { job: Job; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly unlisten: () => void;
  private readonly prefix = randomHex(8);
  private serial = 0;
  private disposed = false;

  constructor(channel: DiagramChannel, options: DiagramRendererOptions = {}) {
    this.channel = channel;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.cacheLimit = options.cacheLimit ?? 200;
    this.unlisten = channel.listen((message) => this.receive(message));
  }

  /** 同样的种类、源码、主题只渲染一次 */
  render(kind: DiagramKind, source: string, theme: DiagramTheme = "light"): Promise<DiagramResult> {
    if (this.disposed) return Promise.resolve(CLOSED);
    const key = cacheKey(kind, source, theme);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    this.serial += 1;
    const request: DiagramRequest = { id: `${this.prefix}-${this.serial}`, kind, source, theme };
    const result = new Promise<DiagramResult>((resolve) => this.queue.push({ request, resolve }));
    this.cache.set(key, result);
    if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value as string);
    // 出错的结果不缓存：改了源码再改回来时重试
    void result.then((value) => {
      if (value.error && this.cache.get(key) === result) this.cache.delete(key);
    });
    this.next();
    return result;
  }

  /** 一次只发一个：沙箱是一张一张画的，超时才能从发出时算 */
  private next(): void {
    if (this.current || this.disposed) return;
    const job = this.queue.shift();
    if (!job) return;
    const timer = setTimeout(() => {
      if (this.current?.job !== job) return;
      this.current = null;
      job.resolve({ error: "图表渲染超时" });
      // 沙箱可能卡在这张图上：拆掉重建，后面的请求发给新的沙箱
      this.channel.restart?.();
      this.next();
    }, this.timeoutMs);
    this.current = { job, timer };
    this.channel.post(job.request);
  }

  private receive(message: unknown): void {
    const current = this.current;
    if (!current || !isResponse(message) || message.id !== current.job.request.id) return;
    clearTimeout(current.timer);
    this.current = null;
    if ("svg" in message && typeof message.svg === "string") {
      const svg = cleanDiagramSvg(message.svg);
      current.job.resolve(svg === null ? { error: "图表沙箱返回的不是 SVG" } : { svg });
    } else {
      current.job.resolve({ error: String((message as { error?: unknown }).error ?? "图表渲染失败") });
    }
    this.next();
  }

  dispose(): void {
    this.disposed = true;
    this.unlisten();
    if (this.current) {
      clearTimeout(this.current.timer);
      this.current.job.resolve(CLOSED);
      this.current = null;
    }
    for (const job of this.queue.splice(0)) job.resolve(CLOSED);
    this.cache.clear();
  }
}

/**
 * 沙箱 iframe：`sandbox="allow-scripts"`、不带 `allow-same-origin`，源是不透明的，读不到父页面，
 * 没有 window.marko（1.2 节）。放在看不见的地方，但大小正常（图表库要量文字）
 */
export function createSandboxFrame(url: string, ownerDocument: Document = document): HTMLIFrameElement {
  const frame = ownerDocument.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:absolute;left:-10000px;top:0;width:1000px;height:800px;border:0";
  frame.src = url;
  ownerDocument.body.append(frame);
  return frame;
}

/** 默认的通道：沙箱 iframe + MessageChannel（见文件开头） */
export class SandboxFrameChannel implements DiagramChannel {
  private readonly url: string;
  private readonly ownerDocument: Document;
  private readonly view: Window;
  private readonly listeners = new Set<(message: unknown) => void>();
  private readonly queued: DiagramRequest[] = [];
  /** 发给当前沙箱、还没回的请求 */
  private readonly unanswered = new Set<string>();
  private frame: HTMLIFrameElement | null = null;
  private port: MessagePort | null = null;
  private loads = 0;
  private disposed = false;
  private readonly onWindowMessage = (event: MessageEvent) => this.handshake(event);

  constructor(url: string, ownerDocument: Document = document) {
    this.url = url;
    this.ownerDocument = ownerDocument;
    this.view = ownerDocument.defaultView ?? window;
    this.view.addEventListener("message", this.onWindowMessage);
    this.start();
  }

  /** 现在的 iframe（测试、调试用） */
  get element(): HTMLIFrameElement | null {
    return this.frame;
  }

  post(request: DiagramRequest): void {
    if (this.disposed) return;
    if (this.port) this.send(request);
    else this.queued.push(request);
  }

  listen(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  restart(): void {
    if (this.disposed) return;
    this.teardown();
    // 发出去还没回的请求按失败回复，渲染器不用干等到超时
    const lost = [...this.unanswered];
    this.unanswered.clear();
    for (const id of lost) this.deliver({ id, error: "图表沙箱已重建" });
    this.start();
  }

  dispose(): void {
    this.disposed = true;
    this.view.removeEventListener("message", this.onWindowMessage);
    this.teardown();
    this.queued.length = 0;
    this.unanswered.clear();
    this.listeners.clear();
  }

  private start(): void {
    this.loads = 0;
    const frame = createSandboxFrame(this.url, this.ownerDocument);
    frame.addEventListener("load", () => {
      if (frame !== this.frame) return;
      this.loads += 1;
      // 第二次 load：沙箱被导航走了
      if (this.loads > 1) this.restart();
    });
    this.frame = frame;
  }

  private handshake(event: MessageEvent): void {
    const frame = this.frame;
    if (!frame || this.port || this.loads > 1 || event.source !== frame.contentWindow) return;
    if ((event.data as { type?: unknown } | null)?.type !== "ready") return;
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = (message: MessageEvent) => this.deliver(message.data);
    // 沙箱的源是不透明的，只能用 "*"；交出去的只有这个端口
    frame.contentWindow?.postMessage({ type: "connect" }, "*", [port2]);
    this.port = port1;
    for (const request of this.queued.splice(0)) this.send(request);
  }

  private send(request: DiagramRequest): void {
    this.unanswered.add(request.id);
    this.port?.postMessage(request);
  }

  private deliver(message: unknown): void {
    const id = (message as { id?: unknown } | null)?.id;
    if (typeof id === "string") this.unanswered.delete(id);
    for (const listener of this.listeners) listener(message);
  }

  private teardown(): void {
    this.port?.close();
    this.port = null;
    this.frame?.remove();
    this.frame = null;
  }
}
