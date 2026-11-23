import type { DefaultCodeLanguageApplyTo } from "@/types";

export type DefaultCodeLanguageChannel = "markdown" | "menu";

export const lastUsedCodeLanguage = "__LAST";

export function normalizeDefaultCodeLanguage(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value
    .trim()
    .replace(/[\r\n`]+/g, "")
    .replace(/[^a-z0-9_+#.\- ]/gi, "")
    .replace(/\s+/g, " ")
    .slice(0, 64);
  return normalized === lastUsedCodeLanguage ? lastUsedCodeLanguage : normalized;
}

export function normalizeDefaultCodeLanguageApplyTo(value: unknown): DefaultCodeLanguageApplyTo {
  if (value === "menu" || value === 2) return "menu";
  if (value === "both" || value === 3) return "both";
  return "markdown";
}

export function resolveDefaultCodeLanguage(
  configuredLanguage: string,
  applyTo: DefaultCodeLanguageApplyTo,
  channel: DefaultCodeLanguageChannel,
  lastLanguage = "",
): string {
  if (applyTo !== "both" && applyTo !== channel) return "";
  const normalized = normalizeDefaultCodeLanguage(configuredLanguage);
  return normalized === lastUsedCodeLanguage
    ? normalizeDefaultCodeLanguage(lastLanguage)
    : normalized;
}
