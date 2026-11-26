// 等 GitHub Actions 上这次推送触发的运行结束，打出每个任务的结果、失败的步骤和标注（.harness/release/SKILL.md）。
// 用公开的 API：不带凭据时每小时 60 次，所以两分钟查一次；设了 GITHUB_TOKEN 就带上。日志要仓库的管理权限，读不到，只读得到标注（known-issues KI-001）。
// 用法：node .harness/release/scripts/watch-run.mjs <工作流文件，如 release.yml> <标签，或 main>
// 结论不是 success 时退出码为 1
import { execFileSync } from "node:child_process";

const REPO = "chain-code/Marko";
const REMOTE = "github";

const [workflow, ref] = process.argv.slice(2);
if (!workflow || !ref) {
  console.error("用法：node .harness/release/scripts/watch-run.mjs <工作流文件> <标签，或 main>");
  process.exit(2);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
// 标签按标签名找（同一个提交推到 main 时可能也跑过一次）；分支按远端分支现在的提交找
const isTag = git("tag", "--list", ref) === ref;
const sha = git("rev-parse", isTag ? `${ref}^{commit}` : `${REMOTE}/${ref}`);

const headers = {
  "User-Agent": "marko-release-check",
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
  if (!response.ok) throw new Error(`${response.status} ${path}：${(await response.text()).slice(0, 200)}`);
  return response.json();
}

// 推送以后运行要过一会儿才出现
let run;
for (let attempt = 0; ; attempt += 1) {
  const { workflow_runs: runs } = await get(`/actions/workflows/${workflow}/runs?head_sha=${sha}&event=push&per_page=10`);
  run = runs.find((candidate) => candidate.head_branch === ref);
  if (run) break;
  if (attempt >= 10) {
    console.error(`没找到 ${workflow} 在 ${ref}（${sha.slice(0, 7)}）上的运行：推上去了吗？推到 main 的提交没改到发布流程的触发路径时它不跑`);
    process.exit(1);
  }
  await sleep(30_000);
}
console.log(`${workflow} 的运行 ${run.id}（${ref}，${sha.slice(0, 7)}）：${run.html_url}`);

let status = run.status;
console.log(`${new Date().toLocaleTimeString()} ${status}`);
while (run.status !== "completed") {
  await sleep(120_000);
  run = await get(`/actions/runs/${run.id}`);
  if (run.status !== status) console.log(`${new Date().toLocaleTimeString()} ${(status = run.status)}`);
}

console.log(`\n结论：${run.conclusion}`);
const { jobs } = await get(`/actions/runs/${run.id}/jobs?per_page=50`);
// 每个任务都有的同一条提示（如 action 的 Node 版本弃用）只打一次
const printed = new Set();
for (const job of jobs) {
  const minutes = job.started_at && job.completed_at ? ((Date.parse(job.completed_at) - Date.parse(job.started_at)) / 60_000).toFixed(1) : "?";
  console.log(`任务 ${job.name}：${job.conclusion}（${minutes} 分钟）`);
  for (const step of job.steps ?? []) {
    if (step.conclusion !== "success" && step.conclusion !== "skipped") console.log(`  步骤 ${step.name}：${step.conclusion}`);
  }
  if (job.conclusion === "skipped") continue;
  for (const annotation of await get(`/check-runs/${job.id}/annotations?per_page=50`)) {
    const key = `${annotation.annotation_level}\n${annotation.title}\n${annotation.message}`;
    if (printed.has(key)) continue;
    printed.add(key);
    const where = annotation.path && annotation.path !== ".github" ? ` ${annotation.path}:${annotation.start_line}` : "";
    console.log(`  [${annotation.annotation_level}]${where} ${annotation.title ?? ""}\n    ${annotation.message.replace(/\n/g, "\n    ")}`);
  }
}
process.exit(run.conclusion === "success" ? 0 : 1);
