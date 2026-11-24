// 图片上传（M-4）：上传接口（本机起一个临时的 HTTP 服务收）、自定义命令
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uploadToApi, uploadWithCommand, urlFromOutput, urlFromResponse, type FetchLike } from "./upload.ts";

let root: string;
let image: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-upload-"));
  image = join(root, "shot 1.png");
  writeFileSync(image, Buffer.from([137, 80, 78, 71]));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("返回的地址", () => {
  it("JSON 里的 url、link、data.url，否则整段文字；命令输出里最后一个网址", () => {
    expect(urlFromResponse('{"url":"https://a/1.png"}')).toBe("https://a/1.png");
    expect(urlFromResponse('{"link":"https://a/2.png"}')).toBe("https://a/2.png");
    expect(urlFromResponse('{"data":{"url":"https://a/3.png"}}')).toBe("https://a/3.png");
    expect(urlFromResponse(" https://a/4.png\n")).toBe("https://a/4.png");
    expect(urlFromOutput("Uploading...\nhttps://cdn/x.png\nhttps://cdn/y.png\n")).toBe("https://cdn/y.png");
    expect(urlFromOutput("failed")).toBeNull();
  });
});

describe("上传接口", () => {
  let server: Server;
  let received: { authorization?: string; body: string } | null;

  beforeEach(async () => {
    received = null;
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = { authorization: request.headers.authorization, body: Buffer.concat(chunks).toString("latin1") };
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: { url: "https://cdn.example/shot.png" } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("表单 POST（字段 file），Token 放在 Authorization；用返回的网址", async () => {
    const { port } = server.address() as { port: number };
    const url = await uploadToApi(image, `http://127.0.0.1:${port}/upload`, "secret-token", fetch as unknown as FetchLike);
    expect(url).toBe("https://cdn.example/shot.png");
    expect(received?.authorization).toBe("secret-token");
    expect(received?.body).toContain('name="file"; filename="shot 1.png"');
    expect(received?.body).toContain("PNG");
  });

  it("没填地址、HTTP 出错：报原因", async () => {
    await expect(uploadToApi(image, " ", null, fetch as unknown as FetchLike)).rejects.toThrow("没有填上传接口的地址");
    const failing: FetchLike = async () => ({ ok: false, status: 500, text: async () => "" });
    await expect(uploadToApi(image, "http://x", null, failing)).rejects.toThrow("HTTP 500");
  });
});

describe("自定义命令", () => {
  it("图片路径加引号接在命令后面，输出里最后一个网址就是地址；出错时报出来", async () => {
    const script = join(root, "up.cjs");
    // 路径里有空格：加了引号，命令拿到的是整个路径
    writeFileSync(script, "console.log('uploading ' + process.argv[2]); console.log('https://cdn.example/' + encodeURIComponent(require('path').basename(process.argv[2])));");
    const url = await uploadWithCommand(image, `node "${script}"`);
    expect(url).toBe("https://cdn.example/shot%201.png");
    const failing = join(root, "fail.cjs");
    writeFileSync(failing, "console.error('quota exceeded'); process.exit(3);");
    await expect(uploadWithCommand(image, `node "${failing}"`)).rejects.toThrow("quota exceeded");
  });
});
