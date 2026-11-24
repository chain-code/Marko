<template>
  <Transition name="marko-drop-hint">
    <div v-if="hint" class="marko-drop-hint" data-testid="drop-hint">
      <span class="marko-drop-hint-text">{{ hint === "insert" ? t("drop.insert") : t("drop.open") }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
// F-15：拖文件到窗口上时盖一层提示（不接鼠标事件，松开的还是下面的元素）
import type { DropHint } from "../composables/useDropOpen.ts";
import { t } from "../i18n.ts";

defineProps<{ hint: DropHint | null }>();
</script>

<style>
.marko-drop-hint {
  position: fixed;
  inset: 8px;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--el-color-primary);
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  pointer-events: none;
}

.marko-drop-hint-text {
  padding: 8px 20px;
  border-radius: 6px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
  color: var(--el-color-primary);
  font-size: 16px;
}

.marko-drop-hint-enter-active,
.marko-drop-hint-leave-active {
  transition: opacity 0.12s;
}

.marko-drop-hint-enter-from,
.marko-drop-hint-leave-to {
  opacity: 0;
}
</style>
