<template>
  <ElTooltip
    :visible="visible"
    :virtual-ref="anchor ?? undefined"
    virtual-triggering
    :content="tip"
    placement="top"
    :teleported="true"
    popper-class="marko-hover-tip"
  />
</template>

<script setup lang="ts">
// B-11、B-16：鼠标停在脚注引用上显示脚注的内容，停在缩写上显示全称（编辑器把文字放在 data-tip；提示框是 Element Plus 的）
import { ElTooltip } from "element-plus";
import "element-plus/es/components/tooltip/style/css";
import { onBeforeUnmount, ref, shallowRef, watch } from "vue";

const props = defineProps<{ container: HTMLElement | null }>();

/** 停多久才显示（同浏览器的 title） */
const DELAY = 400;

const anchor = shallowRef<HTMLElement | null>(null);
const tip = ref("");
const visible = ref(false);
let showTimer: ReturnType<typeof setTimeout> | undefined;

function tipTarget(target: EventTarget | null): HTMLElement | null {
  return ((target as Element | null)?.closest?.("[data-tip]") as HTMLElement | null) ?? null;
}

function hide(): void {
  clearTimeout(showTimer);
  visible.value = false;
}

function onOver(event: MouseEvent): void {
  const target = tipTarget(event.target);
  if (!target || target === anchor.value) return;
  hide();
  showTimer = setTimeout(() => {
    anchor.value = target;
    tip.value = target.dataset.tip ?? "";
    visible.value = tip.value !== "" && target.isConnected;
  }, DELAY);
}

function onOut(event: MouseEvent): void {
  const target = tipTarget(event.target);
  if (!target) return;
  // 在同一个元素里移动（进出它的子元素）不算离开
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
  anchor.value = null;
  hide();
}

/** 编辑起来（按键、点击）就收起 */
function onEdit(): void {
  anchor.value = null;
  hide();
}

watch(
  () => props.container,
  (element, previous) => {
    previous?.removeEventListener("mouseover", onOver);
    previous?.removeEventListener("mouseout", onOut);
    previous?.removeEventListener("mousedown", onEdit);
    previous?.removeEventListener("keydown", onEdit);
    element?.addEventListener("mouseover", onOver);
    element?.addEventListener("mouseout", onOut);
    element?.addEventListener("mousedown", onEdit);
    element?.addEventListener("keydown", onEdit);
  },
  { immediate: true },
);

onBeforeUnmount(hide);
</script>

<style>
.marko-hover-tip.el-popper {
  max-width: 420px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
