<template>
  <ElImageViewer
    v-if="url"
    :url-list="[url]"
    :min-scale="0.4"
    :max-scale="3"
    :close-on-press-escape="true"
    :teleported="true"
    :hide-on-click-modal="true"
    @close="close"
  >
    <template #toolbar="{ actions, reset }">
      <span class="marko-media-viewer-stash" :data-ready="stash(actions, reset)" />
      <ElIcon :title="texts.viewer.zoomOut" @click="actions('zoomOut')"><ZoomOut /></ElIcon>
      <ElIcon :title="texts.viewer.zoomIn" @click="actions('zoomIn')"><ZoomIn /></ElIcon>
      <ElIcon :title="texts.viewer.actualSize" @click="resetView"><RefreshLeft /></ElIcon>
    </template>
  </ElImageViewer>
</template>

<script setup lang="ts">
// D-5、M-6：双击图片、图表打开全窗口查看器（ElImageViewer：缩放 40%～300%、拖动、滚轮缩放、Esc 关闭是现成的）；
// 只补 + - 0 三个键。图表先转成 SVG 的 blob 地址
import { RefreshLeft, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
import { ElIcon, ElImageViewer } from "element-plus";
import "element-plus/es/components/icon/style/css";
import "element-plus/es/components/image-viewer/style/css";
import { onBeforeUnmount, ref } from "vue";
import { useTexts } from "./texts.ts";

type Action = (action: "zoomIn" | "zoomOut") => void;

const texts = useTexts();

const url = ref<string | null>(null);
let objectUrl: string | null = null;
let zoom: Action | null = null;
let toggleMode: (() => void) | null = null;

/** 工具条插槽给的操作函数记下来，键盘用 */
function stash(actions: Action, reset: () => void): string {
  zoom = actions;
  toggleMode = reset;
  return "1";
}

/** 回到原始大小：切换显示方式会重置缩放，切两次回到原来的方式 */
function resetView(): void {
  toggleMode?.();
  toggleMode?.();
}

function onKeydown(event: KeyboardEvent): void {
  if (!url.value || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "+" || event.key === "=") zoom?.("zoomIn");
  else if (event.key === "-" || event.key === "_") zoom?.("zoomOut");
  else if (event.key === "0") resetView();
  else return;
  event.preventDefault();
}

function release(): void {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function close(): void {
  url.value = null;
  release();
  window.removeEventListener("keydown", onKeydown, true);
}

/** 打开图片（地址）或图表（SVG 元素） */
function show(target: string | SVGSVGElement): void {
  release();
  if (typeof target === "string") {
    url.value = target;
  } else {
    const svg = target.cloneNode(true) as SVGSVGElement;
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    objectUrl = URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
    url.value = objectUrl;
  }
  window.addEventListener("keydown", onKeydown, true);
}

onBeforeUnmount(close);

defineExpose({ show, close, isOpen: () => url.value !== null });
</script>

<style>
.marko-media-viewer-stash {
  display: none;
}
</style>
