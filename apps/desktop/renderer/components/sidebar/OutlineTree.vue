<template>
  <div class="outline" data-testid="outline">
    <!-- 没有标题：同 Typora 空着，鼠标移到侧栏上才显示一行字 -->
    <div v-if="!items.length" class="sidebar-hint">{{ t("sidebar.noHeadings") }}</div>
    <ElTree
      v-else
      :data="tree"
      node-key="index"
      :props="{ label: 'title', children: 'children' }"
      :indent="14"
      :default-expand-all="true"
      :expand-on-click-node="false"
      :current-node-key="current ?? undefined"
      :highlight-current="true"
      :class="{ 'outline-fixed': !collapsible }"
      @node-click="(node: OutlineNode) => emit('select', node.index)"
    />
  </div>
</template>

<script setup lang="ts">
// 大纲（W-4，样子同 Typora）：按标题生成的树，每一级往右缩 14px；点标题跳过去；光标所在的标题加粗。S-4「允许折叠大纲」关着时不能折叠
import type { OutlineItem } from "@marko/editor-vue";
import { computed } from "vue";
import { t } from "../../i18n.ts";

interface OutlineNode {
  index: number;
  title: string;
  level: number;
  children: OutlineNode[];
}

const props = defineProps<{ items: OutlineItem[]; current: number | null; collapsible: boolean }>();
const emit = defineEmits<{ select: [index: number] }>();

/** 按级别套成树：比前面的级别低的放进它里面 */
const tree = computed(() => {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  props.items.forEach((item, index) => {
    const node: OutlineNode = { index, title: item.title || t("sidebar.emptyHeading"), level: item.level, children: [] };
    while (stack.length && stack[stack.length - 1].level >= item.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  return roots;
});
</script>

<style scoped>
.outline {
  height: 100%;
  overflow: auto;
  padding: 3px 18px;
  box-sizing: border-box;
}

.outline :deep(.el-tree) {
  background: transparent;
  color: var(--md-text, #333);
  font-size: 14px;
}

/* 缩进由 ElTree 写在行内的 padding-left（每级 14px） */
.outline :deep(.el-tree-node__content) {
  height: auto;
  margin: 1px 0 2px;
  padding-top: 3px;
  padding-bottom: 3px;
  line-height: 1.1rem;
  cursor: pointer;
}

.outline :deep(.el-tree-node__content:hover) {
  background: var(--app-item-hover, rgba(229, 229, 229, 0.59));
}

.outline :deep(.el-tree-node__label) {
  font-size: 14px;
}

/* 光标所在的标题：加粗（同 Typora），没有底色 */
.outline :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: transparent;
  font-weight: 700;
}

.outline :deep(.el-tree-node.is-current > .el-tree-node__content:hover) {
  background: var(--app-item-hover, rgba(229, 229, 229, 0.59));
}

/* 不能折叠：去掉展开箭头 */
.outline-fixed :deep(.el-tree-node__expand-icon) {
  display: none;
}
</style>
