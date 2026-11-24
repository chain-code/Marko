// L-2：Element Plus 自带的文字（空列表、关闭按钮的提示……）跟着界面语言：按语言代码找它自己的语言包（按需加载），
// 先找完整的（pt-br），再找前半段（pt）；它没有的语言用英文。中文直接带上（默认语言，启动时不闪英文）
import type { Language } from "element-plus/es/locale";
import en from "element-plus/es/locale/lang/en";
import zhCn from "element-plus/es/locale/lang/zh-cn";

const packs = import.meta.glob<{ default: Language }>("../../../node_modules/element-plus/es/locale/lang/*.mjs");

function loaderOf(name: string): (() => Promise<{ default: Language }>) | undefined {
  return Object.entries(packs).find(([path]) => path.endsWith(`/${name}.mjs`))?.[1];
}

export async function elementLocaleOf(code: string): Promise<Language> {
  if (code === "zh-CN") return zhCn;
  const name = code.toLowerCase();
  const loader = loaderOf(name) ?? loaderOf(name.split("-")[0]);
  if (!loader) return en;
  try {
    return (await loader()).default;
  } catch {
    return en;
  }
}

export const defaultElementLocale: Language = zhCn;
