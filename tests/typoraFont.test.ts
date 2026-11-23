import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const fontDirectory = resolve("src/assets/fonts");
const expectedHashes = new Map([
  ["open-sans-v17-latin-ext_latin-regular.woff2", "537d46273fe124bbced2f098f26222fa3155741e9d76f906c3c39e7fa09bf6a8"],
  ["open-sans-v17-latin-ext_latin-italic.woff2", "8ddc89881ca5f355826d20b2229266c56a2c8d7be69ff9533b1891b55dc15825"],
  ["open-sans-v17-latin-ext_latin-700.woff2", "59a3166f7bacce6a65bf901ad20f141b619bca39a1318ea5efbdaa587b48a800"],
  ["open-sans-v17-latin-ext_latin-700italic.woff2", "a250cc9c90a94d628301cbeaca7d8aa6276cda73c8a32af07d3ede513447931a"],
]);

test("\u9501\u5b9a Open Sans v17 \u5b57\u4f53\u6587\u4ef6", () => {
  for (const [fileName, expectedHash] of expectedHashes) {
    const content = readFileSync(resolve(fontDirectory, fileName));
    assert.equal(createHash("sha256").update(content).digest("hex"), expectedHash, fileName);
  }
});

test("\u5165\u53e3\u7edf\u4e00\u52a0\u8f7d Open Sans v17 \u5b57\u4f53", () => {
  const css = readFileSync(resolve(fontDirectory, "open-sans-v17.css"), "utf8");
  for (const fileName of expectedHashes.keys()) assert.ok(css.includes(fileName), fileName);
  assert.equal((css.match(/@font-face/g) ?? []).length, 4);

  for (const entry of ["src/main.ts", "src/library.ts"]) {
    const source = readFileSync(resolve(entry), "utf8");
    assert.ok(source.includes('./assets/fonts/open-sans-v17.css'), entry);
    assert.doesNotMatch(source, /@fontsource\/open-sans/, entry);
  }

  const packageJson = readFileSync(resolve("package.json"), "utf8");
  assert.doesNotMatch(packageJson, /@fontsource\/open-sans/);
});

