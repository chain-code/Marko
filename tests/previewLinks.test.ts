import test from "node:test";
import assert from "node:assert/strict";
import {
  getPreviewLinkAction,
  isExternalPreviewHref,
  resolveLocalMarkdownHref,
  resolveRelativeMarkdownHref,
  shouldOpenPreviewLink,
} from "../src/utils/previewLinks";

test("preview links require Ctrl or Command like Typora", () => {
  assert.equal(shouldOpenPreviewLink({}), false);
  assert.equal(shouldOpenPreviewLink({ ctrlKey: true }), true);
  assert.equal(shouldOpenPreviewLink({ metaKey: true }), true);
});

test("getPreviewLinkAction classifies preview links like Typora", () => {
  assert.equal(getPreviewLinkAction("https://example.com/docs"), "external");
  assert.equal(getPreviewLinkAction("mailto:hello@example.com"), "external");
  assert.equal(getPreviewLinkAction("//example.com/docs"), "external");
  assert.equal(getPreviewLinkAction("#heading"), "anchor");
  assert.equal(getPreviewLinkAction("docs/intro.md"), "relative");
  assert.equal(getPreviewLinkAction("file:///C:/docs/intro.md"), "local");
  assert.equal(getPreviewLinkAction("C:%5Cdocs%5Cintro.md"), "local");
  assert.equal(getPreviewLinkAction("\\\\server\\share\\intro.md"), "local");
  assert.equal(getPreviewLinkAction("%5C%5Cserver%5Cshare%5Cintro.md"), "local");
  assert.equal(getPreviewLinkAction("javascript:alert(1)"), "blocked");
  assert.equal(getPreviewLinkAction(" data:text/html,hi "), "blocked");
  assert.equal(getPreviewLinkAction(""), "none");
});

test("isExternalPreviewHref only marks links that should leave the editor", () => {
  assert.equal(isExternalPreviewHref("https://example.com"), true);
  assert.equal(isExternalPreviewHref("obsidian://open?vault=docs"), true);
  assert.equal(isExternalPreviewHref("file:///C:/docs/other.md"), false);
  assert.equal(isExternalPreviewHref("C:/docs/other.md"), false);
  assert.equal(isExternalPreviewHref("#local"), false);
  assert.equal(isExternalPreviewHref("other.md"), false);
  assert.equal(isExternalPreviewHref("javascript:alert(1)"), false);
});

test("resolveRelativeMarkdownHref resolves local markdown links beside the current document", () => {
  assert.equal(
    resolveRelativeMarkdownHref("../guide/intro%20one.md#start", "C:\\docs\\drafts\\current.md"),
    "C:/docs/guide/intro one.md",
  );
  assert.equal(
    resolveRelativeMarkdownHref("./chapter.mdown?from=toc", "/home/me/docs/current.markdown"),
    "/home/me/docs/chapter.mdown",
  );
  assert.equal(
    resolveRelativeMarkdownHref("./appendix.mkdn?from=toc", "/home/me/docs/current.markdown"),
    "/home/me/docs/appendix.mkdn",
  );
  assert.equal(resolveRelativeMarkdownHref("image.png", "C:/docs/current.md"), null);
  assert.equal(resolveRelativeMarkdownHref("https://example.com/a.md", "C:/docs/current.md"), null);
  assert.equal(resolveRelativeMarkdownHref("other.md", undefined), null);
});

test("resolveLocalMarkdownHref opens absolute local markdown links like Typora", () => {
  assert.equal(
    resolveLocalMarkdownHref("file:///C:/docs/My%20Note.md#top"),
    "C:/docs/My Note.md",
  );
  assert.equal(
    resolveLocalMarkdownHref("C:%5Cdocs%5C..%5Cguide%5Cintro.markdown?from=note"),
    "C:/guide/intro.markdown",
  );
  assert.equal(
    resolveLocalMarkdownHref("\\\\server\\share\\docs\\intro.md#top"),
    "//server/share/docs/intro.md",
  );
  assert.equal(
    resolveLocalMarkdownHref("%5C%5Cserver%5Cshare%5Cdocs%5Cintro.md"),
    "//server/share/docs/intro.md",
  );
  assert.equal(
    resolveLocalMarkdownHref("/home/me/docs/../notes/today.mdown#section"),
    "/home/me/notes/today.mdown",
  );
  assert.equal(
    resolveLocalMarkdownHref("file:///C:/docs/Research%20Note.mdwn#top"),
    "C:/docs/Research Note.mdwn",
  );
  assert.equal(
    resolveLocalMarkdownHref("C:/docs/report.rmd?from=note"),
    "C:/docs/report.rmd",
  );
  assert.equal(resolveLocalMarkdownHref("file:///C:/docs/image.png"), null);
  assert.equal(resolveLocalMarkdownHref("obsidian://open?vault=docs"), null);
});
