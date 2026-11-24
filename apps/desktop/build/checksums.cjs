// R-1：每个安装包配一个 SHA-256 校验文件（<安装包>.sha256，内容同 sha256sum 的输出：「十六进制 *文件名」）。
// electron-builder 的 afterAllArtifactBuild 钩子：返回的文件也算这次的产物（发布时一起上传）
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { writeFile } = require("node:fs/promises");
const { basename } = require("node:path");

/** 安装包、压缩包这些给用户下载的（不含 blockmap、更新用的 yml） */
const INSTALLERS = /\.(exe|dmg|zip|AppImage|deb)$/;

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

module.exports = async function writeChecksums(result) {
  const written = [];
  for (const artifact of result.artifactPaths) {
    if (!INSTALLERS.test(artifact)) continue;
    const target = `${artifact}.sha256`;
    await writeFile(target, `${await sha256(artifact)} *${basename(artifact)}\n`);
    written.push(target);
  }
  return written;
};
