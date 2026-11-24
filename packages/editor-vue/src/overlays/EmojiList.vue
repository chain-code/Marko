<template>
  <ElPopover
    :visible="state.visible"
    :virtual-ref="caret"
    virtual-triggering
    placement="bottom-start"
    width="auto"
    :show-arrow="false"
    :offset="4"
    :teleported="true"
    :persistent="false"
    popper-class="marko-emoji-popper"
  >
    <div class="marko-emoji-list" role="listbox" data-testid="emoji-list" @mousedown.prevent>
      <div
        v-for="(item, index) in state.items"
        :key="item.shortcode"
        class="marko-emoji-option"
        :class="{ 'is-selected': index === state.selected }"
        role="option"
        :aria-selected="index === state.selected"
        @mouseenter="state.selected = index"
        @mousedown.prevent="state.choose?.(item)"
      >
        <span class="marko-emoji-glyph">{{ item.emoji }}</span>
        <span class="marko-emoji-name">:{{ item.shortcode }}:</span>
      </div>
    </div>
  </ElPopover>
</template>

<script setup lang="ts">
// I-5：Emoji 补全的候选列表（Element Plus 的弹出框，贴着光标；状态由 emojiBridge 给）
import { ElPopover } from "element-plus";
import "element-plus/es/components/popover/style/css";
import { computed } from "vue";
import type { EmojiListState } from "./emojiBridge.ts";

const props = defineProps<{ state: EmojiListState }>();

/** 弹出框贴着的位置：光标处 */
const caret = computed(() => {
  const rect = props.state.rect;
  return { getBoundingClientRect: () => rect ?? new DOMRect() };
});
</script>

<style>
.marko-emoji-popper.el-popover.el-popper {
  min-width: 12em;
  padding: 4px 0;
}

/* 最多 10 个候选，都放得下 */
.marko-emoji-list {
  max-height: 19em;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.8;
}

.marko-emoji-option {
  display: flex;
  gap: 0.5em;
  padding: 0 12px;
  cursor: pointer;
}

.marko-emoji-option.is-selected {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.marko-emoji-name {
  color: var(--el-text-color-secondary);
  font-family: var(--md-mono, monospace);
}
</style>
