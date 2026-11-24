// 阶段 4 的验收：test/behavior/ 的全部行为规格在新编辑器上通过（格式见 test/behavior/README.md）。
// 设了 MARKO_BEHAVIOR_REPORT=<文件> 时把失败的规格写进这个文件，方便逐条看
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repo } from "../helpers.ts";
import { describeFailure, runSpec } from "./runner.ts";
import { loadSpecs, markText } from "./spec.ts";

const specs = loadSpecs(join(repo, "test", "behavior"));
const report = process.env.MARKO_BEHAVIOR_REPORT;

describe("行为规格", () => {
  if (report) {
    it("汇总", () => {
      const results = specs.map((spec) => ({ spec, result: runSpec(spec) }));
      const failures = results.filter(({ result }) => !result.pass);
      const byId = new Map<string, number>();
      for (const { spec } of failures) byId.set(spec.id, (byId.get(spec.id) ?? 0) + 1);
      const unrepresentable = results.filter(({ result }) => result.setup).length;
      const summary = [
        `通过 ${specs.length - failures.length} / ${specs.length}`,
        `before 放进编辑器读出来不一样：${unrepresentable}`,
        ...[...byId].sort((a, b) => b[1] - a[1]).map(([id, count]) => `${id}: ${count}`),
      ];
      writeFileSync(report, [summary.join("\n"), ...failures.map(({ spec, result }) => describeFailure(spec, result))].join("\n\n────────\n\n"));
      // 同名的 .json：每条的结果，给分析脚本用
      const json = results.map(({ spec, result }) => ({
        where: `${spec.file}:${spec.line}`,
        id: spec.id,
        title: spec.title,
        op: spec.raw,
        before: markText(spec.before),
        after: markText(spec.after),
        actual: result.actual ? markText(result.actual) : null,
        setup: result.setup ? markText(result.setup) : null,
        error: result.error ?? null,
        pass: result.pass,
      }));
      writeFileSync(report.replace(/\.[^.]+$/, "") + ".json", JSON.stringify(json, null, 1));
    });
    return;
  }
  it.each(specs.map((spec) => [`${spec.file}:${spec.line} ${spec.id} ${spec.title}`, spec] as const))("%s", (_name, spec) => {
    const result = runSpec(spec);
    expect(result.pass, describeFailure(spec, result)).toBe(true);
  });
});
