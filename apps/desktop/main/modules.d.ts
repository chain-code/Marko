// 没有自带类型声明的依赖：只声明这里用到的部分

declare module "jschardet" {
  export interface DetectionResult {
    encoding: string | null;
    confidence: number;
  }
  export function detect(buffer: Buffer | string, options?: { minimumThreshold?: number; detectEncodings?: string[] }): DetectionResult;
  const jschardet: { detect: typeof detect };
  export default jschardet;
}

declare module "write-file-atomic" {
  interface Options {
    encoding?: BufferEncoding;
    mode?: number;
    fsync?: boolean;
  }
  function writeFileAtomic(filename: string, data: string | Uint8Array, options?: Options | BufferEncoding): Promise<void>;
  export default writeFileAtomic;
}
