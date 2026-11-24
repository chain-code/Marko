<template>
  <div class="outline" data-testid="outline">
    <ElEmpty v-if="!items.length" :description="t('sidebar.noHeadings')" :image-size="60" />
    <ElTree
      v-else
      :data="tree"
      node-key="index"
      :props="{ label: 'title', children: 'children' }"
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
// 大纲（W-4）：按标题生成的树；点标题跳过去；光标所在的标题高亮。S-4「允许折叠大纲」关着时不能折叠
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
  padding: 4px 0;
}

/* 不能折叠：去掉展开箭头的点击 */
.outline-fixed :deep(.el-tree-node__expand-icon) {
  pointer-events: none;
  visibility: hidden;
}
</style>
