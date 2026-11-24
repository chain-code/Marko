// 外部链接（1.10 节、N-4）：只允许 http、https、mailto 交给 shell.openExternal

export function isAllowedExternalUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url);
}
