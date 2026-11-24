// 随机串：slot 占位的 nonce（html.ts）、图表请求 id 的前缀（diagrams.ts）、沙箱实例的前缀（sandbox.ts）
export function randomHex(bytes: number): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
