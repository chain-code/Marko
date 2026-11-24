// D-3、D-4、D-6、1.2 节：图表渲染接口和沙箱通道。真正的沙箱页在 Electron 应用里由端到端测试检查（test/e2e）
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanDiagramSvg, DiagramRenderer, SandboxFrameChannel, type DiagramChannel, type DiagramRequest } from "../src/diagrams.ts";

/** 假沙箱：记下请求，由测试决定怎么回（undefined 表示不回） */
function fakeChannel(reply: (request: DiagramRequest) => unknown | undefined) {
  const requests: DiagramRequest[] = [];
  const listeners = new Set<(message: unknown) => void>();
  let restarts = 0;
  const channel: DiagramChannel = {
    post(request) {
      requests.push(request);
      const response = reply(request);
      if (response !== undefined) queueMicrotask(() => listeners.forEach((listener) => listener(response)));
    },
    listen(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    restart() {
      restarts += 1;
    },
  };
  return { channel, requests, restarts: () => restarts, send: (message: unknown) => listeners.forEach((listener) => listener(message)) };
}

describe("图表渲染接口", () => {
  it("发出种类、源码、主题，拿回过滤过的 SVG；请求 id 带渲染器自己的随机前缀", async () => {
    const { channel, requests } = fakeChannel((request) => ({ id: request.id, svg: '<svg onload="alert(1)"><script>x</script><g></g></svg>' }));
    const renderer = new DiagramRenderer(channel);
    const result = await renderer.render("mermaid", "graph TD; A-->B", "dark");
    expect(requests).toEqual([{ id: expect.stringMatching(/^[0-9a-f]{16}-1$/), kind: "mermaid", source: "graph TD; A-->B", theme: "dark" }]);
    expect(result.svg).toBe("<svg><g></g></svg>");
  });

  it("同样的源码只渲染一次；换了主题重新渲染", async () => {
    const { channel, requests } = fakeChannel((request) => ({ id: request.id, svg: "<svg></svg>" }));
    const renderer = new DiagramRenderer(channel);
    await Promise.all([renderer.render("sequence", "A->B: hi"), renderer.render("sequence", "A->B: hi")]);
    await renderer.render("sequence", "A->B: hi", "dark");
    expect(requests.map((request) => request.theme)).toEqual(["light", "dark"]);
  });

  it("D-6 出错时给出错误信息；出错的结果不缓存，下次重试", async () => {
    let fail = true;
    const { channel, requests } = fakeChannel((request) => (fail ? { id: request.id, error: "Parse error on line 1" } : { id: request.id, svg: "<svg></svg>" }));
    const renderer = new DiagramRenderer(channel);
    expect(await renderer.render("flowchart", "st=>bad")).toEqual({ error: "Parse error on line 1" });
    fail = false;
    expect(await renderer.render("flowchart", "st=>bad")).toEqual({ svg: "<svg></svg>" });
    expect(requests).toHaveLength(2);
  });

  it("过滤后不是 <svg> 元素的（前面有文字）当作失败", async () => {
    const { channel } = fakeChannel((request) => ({ id: request.id, svg: '" onmouseover="alert(1)" x="<svg></svg>' }));
    expect(await new DiagramRenderer(channel).render("mermaid", "x")).toEqual({ error: "图表沙箱返回的不是 SVG" });
    expect(cleanDiagramSvg("<svg><g></g></svg>")).toBe("<svg><g></g></svg>");
    expect(cleanDiagramSvg("<p>x</p>")).toBeNull();
  });

  it("一次只发一个：后面的请求等前一个回了再发，超时从发出时算", async () => {
    vi.useFakeTimers();
    try {
      const { channel, requests, send } = fakeChannel(() => undefined);
      const renderer = new DiagramRenderer(channel, { timeoutMs: 100 });
      const first = renderer.render("mermaid", "a");
      const second = renderer.render("mermaid", "b");
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(90);
      send({ id: requests[0].id, svg: "<svg></svg>" });
      expect(await first).toEqual({ svg: "<svg></svg>" });
      // 第二个这时才发出去：再过 90 毫秒（从第一个发出算已经 180）也还没超时
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(90);
      send({ id: requests[1].id, svg: "<svg><g></g></svg>" });
      expect(await second).toEqual({ svg: "<svg><g></g></svg>" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("超时：这一个失败，沙箱重建，接着发下一个；超时以后才到的回复不理", async () => {
    vi.useFakeTimers();
    try {
      const { channel, requests, restarts, send } = fakeChannel(() => undefined);
      const renderer = new DiagramRenderer(channel, { timeoutMs: 100 });
      const stuck = renderer.render("mermaid", "stuck");
      const next = renderer.render("mermaid", "next");
      await vi.advanceTimersByTimeAsync(100);
      expect(await stuck).toEqual({ error: "图表渲染超时" });
      expect(restarts()).toBe(1);
      expect(requests.map((request) => request.source)).toEqual(["stuck", "next"]);
      send({ id: requests[0].id, svg: "<svg>late</svg>" });
      send({ id: requests[1].id, svg: "<svg></svg>" });
      expect(await next).toEqual({ svg: "<svg></svg>" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("两个渲染器共用一个通道时只认自己的回复", async () => {
    const { channel, requests, send } = fakeChannel(() => undefined);
    const a = new DiagramRenderer(channel);
    const b = new DiagramRenderer(channel);
    const fromA = a.render("mermaid", "same");
    const fromB = b.render("mermaid", "same");
    expect(requests[0].id).not.toBe(requests[1].id);
    send({ id: requests[0].id, svg: "<svg>a</svg>" });
    send({ id: requests[1].id, svg: "<svg>b</svg>" });
    expect(await fromA).toEqual({ svg: "<svg>a</svg>" });
    expect(await fromB).toEqual({ svg: "<svg>b</svg>" });
  });

  it("不认识的消息不理会；关闭时正在画的和排着的请求都结束", async () => {
    const { channel } = fakeChannel(() => ({ type: "noise" }));
    const renderer = new DiagramRenderer(channel);
    const drawing = renderer.render("mermaid", "graph TD");
    const waiting = renderer.render("mermaid", "graph LR");
    renderer.dispose();
    expect(await drawing).toEqual({ error: "图表渲染器已关闭" });
    expect(await waiting).toEqual({ error: "图表渲染器已关闭" });
    expect(await renderer.render("mermaid", "x")).toEqual({ error: "图表渲染器已关闭" });
  });
});

describe("1.2 节 沙箱通道（SandboxFrameChannel）", () => {
  let channel: SandboxFrameChannel | null = null;
  afterEach(() => {
    channel?.dispose();
    channel = null;
  });

  /** 模拟沙箱页：接住宿主交过来的端口，按 reply 回 */
  function openChannel() {
    const created = new SandboxFrameChannel("app://marko/sandbox.html");
    channel = created;
    const frame = created.element as HTMLIFrameElement;
    const sandboxWindow = frame.contentWindow as Window;
    let port: MessagePort | null = null;
    const connects: unknown[] = [];
    sandboxWindow.postMessage = ((message: unknown, _origin: string, transfer?: Transferable[]) => {
      connects.push(message);
      port = (transfer?.[0] as MessagePort | undefined) ?? null;
    }) as Window["postMessage"];
    const ready = () => window.dispatchEvent(new MessageEvent("message", { data: { type: "ready" }, source: sandboxWindow }));
    return { created, frame, sandboxWindow, connects, ready, port: () => port };
  }

  it("沙箱说 ready 以后交给它一个端口，请求和回复走端口；ready 之前的请求先排着", async () => {
    const { created, connects, ready, port } = openChannel();
    const replies: unknown[] = [];
    created.listen((message) => replies.push(message));
    created.post({ id: "r-1", kind: "mermaid", source: "graph TD", theme: "light" });
    ready();
    expect(connects).toEqual([{ type: "connect" }]);
    const sandboxPort = port() as MessagePort;
    const received = await new Promise<unknown>((resolve) => {
      sandboxPort.onmessage = (event) => resolve(event.data);
    });
    expect(received).toEqual({ id: "r-1", kind: "mermaid", source: "graph TD", theme: "light" });
    sandboxPort.postMessage({ id: "r-1", svg: "<svg></svg>" });
    await vi.waitFor(() => expect(replies).toEqual([{ id: "r-1", svg: "<svg></svg>" }]));
  });

  it("只认这个 iframe 的第一条 ready；别的窗口发来的、第二条 ready 都不理", () => {
    const { connects, ready } = openChannel();
    window.dispatchEvent(new MessageEvent("message", { data: { type: "ready" }, source: window }));
    expect(connects).toEqual([]);
    ready();
    ready();
    expect(connects).toHaveLength(1);
  });

  it("iframe 第二次 load（被导航走了）：拆掉重建，发出去还没回的请求按失败回复", async () => {
    const { created, frame, ready } = openChannel();
    const replies: unknown[] = [];
    created.listen((message) => replies.push(message));
    ready();
    created.post({ id: "r-1", kind: "mermaid", source: "graph TD", theme: "light" });
    frame.dispatchEvent(new Event("load"));
    expect(created.element).toBe(frame);
    frame.dispatchEvent(new Event("load"));
    expect(frame.isConnected).toBe(false);
    expect(created.element).not.toBe(frame);
    expect(created.element?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(replies).toEqual([{ id: "r-1", error: "图表沙箱已重建" }]);
  });
});
