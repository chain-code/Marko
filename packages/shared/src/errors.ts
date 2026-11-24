// 主进程接口统一的错误格式（1.9 节）：code 是英文枚举，message 是当前界面语言的说明

export const ERROR_CODES = [
  "not_found",
  "conflict",
  "out_of_scope",
  "io_error",
  "pandoc_missing",
  "upload_failed",
  "cancelled",
  "invalid_argument",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface MarkoError {
  code: ErrorCode;
  message: string;
}

/** 判断一个值是不是主进程返回的错误。 */
export function isMarkoError(value: unknown): value is MarkoError {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as MarkoError).code === "string"
    && (ERROR_CODES as readonly string[]).includes((value as MarkoError).code)
    && typeof (value as MarkoError).message === "string";
}
