// Callout 标题前的图标（B-13）：GitHub Octicons（MIT 许可），GitHub 和 Typora 用的也是这一套。
// 只引用用到的 5 个 SVG 文件，不把整套图标（1.5 MB）打进来
import alert from "@primer/octicons/build/svg/alert-16.svg?raw";
import info from "@primer/octicons/build/svg/info-16.svg?raw";
import lightBulb from "@primer/octicons/build/svg/light-bulb-16.svg?raw";
import report from "@primer/octicons/build/svg/report-16.svg?raw";
import stop from "@primer/octicons/build/svg/stop-16.svg?raw";

/** 同 Typora 的导出：跟着文字大小（1em），颜色由 CSS 的 fill: currentColor 决定 */
function sized(svg: string): string {
  const result = svg.trim().replace(' width="16" height="16"', ' width="1em" height="1em" aria-hidden="true"');
  if (result === svg.trim()) throw new Error("@primer/octicons 的 SVG 格式变了，请更新 alertIcons.ts");
  return result;
}

export const ALERT_ICONS: Readonly<Record<string, string>> = {
  note: sized(info),
  tip: sized(lightBulb),
  important: sized(report),
  warning: sized(alert),
  caution: sized(stop),
};

/** 标题的名称（同 GitHub、Typora 的导出，不翻译） */
export const ALERT_TITLES: Readonly<Record<string, string>> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};
