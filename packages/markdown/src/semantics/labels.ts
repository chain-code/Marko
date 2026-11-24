// 标签的规范化（CommonMark 4.7）：去两头空白、内部空白合并成一个空格、不分大小写。
// 链接引用定义、脚注、缩写都按它比较

export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();
}
