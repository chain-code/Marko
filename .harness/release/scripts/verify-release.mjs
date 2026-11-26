// 核对 GitHub Release（.harness/release/SKILL.md）：不是草稿、不是预发布；三个平台的文件齐全；三个 latest*.yml 的版本、文件名、大小
// 和实际文件一致；.sha256 是「64 位十六进制 *文件名」；正文和 .github/release-notes/<版本>.md 一致；releases/latest 指向这个版本。
// 用公开的 API 和下载地址（设了 GITHUB_TOKEN 就带上）。--hash 时再下载安装包核对 sha512、sha256（约 600 MB）
// 用法：node .harness/release/scripts/verify-release.mjs <版本> [--hash]
// 有问题时退出码为 1
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

const REPO = "chain-code/Marko";

const version = process.argv[2];
const hashing = process.argv.includes("--hash");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("用法：node .harness/release/scripts/verify-release.mjs <版本，如 2.0.1> [--hash]");
  process.exit(2);
}

const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
const headers = { "User-Agent": "marko-release-check", Accept: "application/vnd.github+json", ...auth };

async function getJson(path) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}
async function download(asset) {
  const response = await fetch(asset.browser_download_url, { headers: { "User-Agent": "marko-release-check", ...auth } });
  if (!response.ok) throw new Error(`${response.status} ${asset.name}`);
  return Buffer.from(await response.arrayBuffer());
}

const release = await getJson(`/releases/tags/${version}`);
if (!release) {
  console.error(`${version} 还没有 Release（发布流程没跑完，或者 publish 没跑）`);
  process.exit(1);
}
const problems = [];
console.log(`${release.name}：draft=${release.draft} prerelease=${release.prerelease} published=${release.published_at}`);
console.log(release.html_url);
if (release.draft || release.prerelease) problems.push("Release 是草稿或预发布");
const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
for (const asset of release.assets) console.log(`  ${asset.name.padEnd(42)} ${String(asset.size).padStart(11)}  ${asset.state}`);

const expected = [
  `Marko-${version}-x64-setup.exe`, `Marko-${version}-x64-setup.exe.blockmap`, `Marko-${version}-x64-setup.exe.sha256`, "latest.yml",
  `Marko-${version}-arm64.dmg`, `Marko-${version}-arm64.dmg.blockmap`, `Marko-${version}-arm64.dmg.sha256`,
  `Marko-${version}-arm64-mac.zip`, `Marko-${version}-arm64-mac.zip.blockmap`, `Marko-${version}-arm64-mac.zip.sha256`, "latest-mac.yml",
  `Marko-${version}.AppImage`, `Marko-${version}.AppImage.sha256`,
  `marko_${version}_amd64.deb`, `marko_${version}_amd64.deb.sha256`, "latest-linux.yml",
  "LICENSE",
];
for (const name of expected) if (!assets.has(name)) problems.push(`缺少 ${name}`);
for (const asset of release.assets) if (asset.state !== "uploaded") problems.push(`${asset.name} 没传完（${asset.state}）`);

// 自动更新用的 yml：引用的文件都在、大小一致；对应的 .sha256 格式对。--hash 时再对内容
for (const name of ["latest.yml", "latest-mac.yml", "latest-linux.yml"]) {
  if (!assets.has(name)) continue;
  const info = parse((await download(assets.get(name))).toString("utf8"));
  if (info.version !== version) problems.push(`${name} 的版本是 ${info.version}`);
  console.log(`\n${name}：version=${info.version} files=${info.files.map((file) => file.url).join(", ")}`);
  for (const file of info.files) {
    const asset = assets.get(file.url);
    if (!asset) {
      problems.push(`${name} 引用的 ${file.url} 不在 Release 里`);
      continue;
    }
    if (asset.size !== file.size) problems.push(`${file.url} 的大小 ${asset.size}，${name} 里写的是 ${file.size}`);
    const checksum = assets.get(`${file.url}.sha256`);
    const line = checksum ? (await download(checksum)).toString("utf8").trim() : "";
    const [hex, ...rest] = line.split(" ");
    if (checksum && !(/^[0-9a-f]{64}$/.test(hex) && rest.join(" ") === `*${file.url}`)) problems.push(`${file.url}.sha256 的格式不对：${line}`);
    if (!hashing) {
      console.log(`  ${file.url}：大小 ${asset.size === file.size ? "一致" : "不一致"}`);
      continue;
    }
    const body = await download(asset);
    const sha512 = createHash("sha512").update(body).digest("base64");
    const sha256 = createHash("sha256").update(body).digest("hex");
    console.log(`  ${file.url}：大小 ${asset.size === file.size ? "一致" : "不一致"}，sha512 ${sha512 === file.sha512 ? "一致" : "不一致"}，sha256 ${hex === sha256 ? "一致" : "不一致"}`);
    if (sha512 !== file.sha512) problems.push(`${file.url} 的 sha512 和 ${name} 不一致`);
    if (checksum && hex !== sha256) problems.push(`${file.url}.sha256 和文件不一致`);
  }
}

// 正文就是仓库里的发布说明
const notes = new URL(`../../../.github/release-notes/${version}.md`, import.meta.url);
const normalize = (text) => text.replace(/\r\n/g, "\n").trim();
if (!existsSync(notes)) problems.push(`仓库里没有 .github/release-notes/${version}.md`);
else if (normalize(release.body ?? "") !== normalize(readFileSync(notes, "utf8"))) problems.push("Release 的正文和 .github/release-notes 里的不一致");

const latest = await getJson("/releases/latest");
console.log(`\nreleases/latest → ${latest?.tag_name}`);
if (latest?.tag_name !== version) problems.push(`releases/latest 指向 ${latest?.tag_name}`);

if (problems.length) {
  console.log(`\n问题：\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\n全部核对通过");
