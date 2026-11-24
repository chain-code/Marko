// 界面文字（L-2）：和主进程用同一份翻译（locales/）。组件模板、composables、普通模块都用这里的 t：
// 路径写错了类型检查就报错；读的是全局的当前语言，模板里用到的在换语言以后自动更新
import { createI18n } from "vue-i18n";
import { DEFAULT_LOCALE, LOCALES, localeOf, type MessageKey, type MessageParams, type MessageSchema } from "../locales/index.ts";

export const i18n = createI18n<[MessageSchema], string, false>({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: LOCALES,
  missingWarn: false,
  fallbackWarn: false,
});

export function t(key: MessageKey, params: MessageParams = {}): string {
  return i18n.global.t(key, params);
}

/** 按拼出来的路径取（偏好设置的各项：settings.label.<设置名>）；没有这条时是 null */
export function tryT(key: string, params: MessageParams = {}): string | null {
  return i18n.global.te(key) ? i18n.global.t(key, params) : null;
}

/** 换界面语言（设置变了的时候）：不用重新加载页面 */
export function setLocale(language: string): void {
  const locale = localeOf(language);
  i18n.global.locale.value = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/** 系统的文件管理器叫什么（「在访达中显示」「在资源管理器中显示」） */
export function fileManagerName(userAgent = navigator.userAgent): string {
  if (/mac/i.test(userAgent)) return t("common.fileManager.mac");
  if (/windows/i.test(userAgent)) return t("common.fileManager.windows");
  return t("common.fileManager.linux");
}
