import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalMediaMarkup,
  getLocalImageAlt,
  getLocalMediaKind,
} from "../src/utils/localMedia";

test("getLocalMediaKind recognizes Typora image, video and audio extensions", () => {
  assert.equal(getLocalMediaKind("photo.jfif"), "image");
  assert.equal(getLocalMediaKind("scan.tif"), "image");
  assert.equal(getLocalMediaKind("scan.TIFF"), "image");
  assert.equal(getLocalMediaKind("demo.webm"), "video");
  assert.equal(getLocalMediaKind("voice.flac"), "audio");
  assert.equal(getLocalMediaKind("voice.m4a"), "audio");
  assert.equal(getLocalMediaKind("protected.m4p"), "audio");
  assert.equal(getLocalMediaKind("podcast.ogg"), "audio");
  assert.equal(getLocalMediaKind("podcast.ogg", "video/ogg"), "audio");
  assert.equal(getLocalMediaKind("voice.w4a"), null);
  assert.equal(getLocalMediaKind("clipboard", "image/png"), "image");
  assert.equal(getLocalMediaKind("unknown.bin"), null);
});

test("getLocalImageAlt keeps the file name and removes only its extension", () => {
  assert.equal(getLocalImageAlt("C:\\素材\\流程 图.tiff"), "流程 图");
  assert.equal(getLocalImageAlt("assets/flow%20chart.png"), "flow chart");
  assert.equal(getLocalImageAlt(".png"), "图片");
});

test("buildLocalMediaMarkup creates image markdown and controlled HTML media", () => {
  assert.equal(
    buildLocalMediaMarkup("image", "assets/流程%20图.png", "流程 [图].png"),
    "![流程 \\[图\\]](assets/流程%20图.png)",
  );
  assert.equal(
    buildLocalMediaMarkup("video", "assets/demo.mp4?x=1&y=2", "demo.mp4"),
    '<video src="assets/demo.mp4?x=1&amp;y=2" controls></video>',
  );
  assert.equal(
    buildLocalMediaMarkup("audio", 'assets/a"b.mp3', 'a"b.mp3'),
    '<audio src="assets/a&quot;b.mp3" controls></audio>',
  );
});
