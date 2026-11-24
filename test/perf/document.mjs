// X-3 性能测试用的文档（旧版本的基线和新编辑器用同一份，docs/重构计划.md 4.2 节）

/** 约 10 万字的文档：标题、段落、列表、少量代码块和表格，不含公式和图表。 */
export function buildPerfDocument(targetChars = 100_000) {
  const sentences = [
    "Marko 是一款本地优先的 Markdown 编辑器，",
    "它把可视化编辑和纯文本的可靠性放在一起。",
    "This paragraph mixes English words with 中文句子 to look like real notes. ",
    "写作工具应该让人感觉不到它的存在，",
    "需要格式的时候按一下快捷键就有。",
  ];
  const blocks = ["# PERF-START 性能基线文档"];
  let chars = blocks[0].length;
  for (let index = 1; chars < targetChars; index += 1) {
    let block;
    if (index % 40 === 1) block = `## 第 ${index} 节 Section ${index}`;
    else if (index % 10 === 5) block = `- 列表项 ${index}：${sentences[index % 5]}`;
    else if (index % 97 === 0) block = `\`\`\`js\nconst value = ${index};\nconsole.log(value);\n\`\`\``;
    else if (index % 131 === 0) block = `| 列 1 | 列 2 |\n| --- | --- |\n| ${index} | **粗体** |`;
    else block = `第 ${index} 段：${sentences[index % 5]}${sentences[(index + 1) % 5]}包含**粗体**、*斜体*、\`代码\` 和 [链接](https://example.com/${index})。`;
    blocks.push(block);
    chars += block.length;
  }
  blocks.push("PERF-END 结束");
  const text = `${blocks.join("\n\n")}\n`;
  return { text, blocks: blocks.length, chars: text.length };
}
