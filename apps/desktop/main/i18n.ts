// 主进程的界面文字（L-2）：菜单、文件对话框、错误提示。和渲染进程用同一份翻译（locales/），引擎是 vue-i18n 底下的 @intlify/core-base。
// 设置里换了语言时 setLocale，再重建菜单；之后弹出的对话框、返回的错误都用新的语言
import {
  compile,
  createCoreContext,
  fallbackWithLocaleChain,
  registerLocaleFallbacker,
  registerMessageCompiler,
  registerMessageResolver,
  resolveValue,
  translate,
} from "@intlify/core-base";
import { DEFAULT_LOCALE, LOCALES, localeOf, type MessageKey, type MessageParams } from "../locales/index.ts";

registerMessageCompiler(compile);
registerMessageResolver(resolveValue);
registerLocaleFallbacker(fallbackWithLocaleChain);

const context = createCoreContext({
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: LOCALES,
  missingWarn: false,
  fallbackWarn: false,
});

export function setLocale(language: string): void {
  context.locale = localeOf(language);
}

export function currentLocale(): string {
  return context.locale as string;
}

export function t(key: MessageKey, params: MessageParams = {}): string {
  const text = translate(context, key, params);
  return typeof text === "string" ? text : key;
}

/** 系统的文件管理器叫什么（「在访达中显示」「在资源管理器中显示」） */
export function fileManagerName(): string {
  if (process.platform === "darwin") return t("common.fileManager.mac");
  if (process.platform === "win32") return t("common.fileManager.windows");
  return t("common.fileManager.linux");
}
