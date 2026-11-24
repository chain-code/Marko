<template>
  <ElDialog
    :model-value="visible"
    class="marko-quick-open"
    width="600px"
    top="12vh"
    :show-close="false"
    destroy-on-close
    @update:model-value="(value: boolean) => emit('update:visible', value)"
    @opened="focus"
  >
    <ElInput
      ref="input"
      v-model="query"
      :placeholder="workspace ? t('quickOpen.placeholderWorkspace') : t('quickOpen.placeholderRecent')"
      data-testid="quick-open-input"
      @keydown="onKeydown"
    />
    <div ref="list" class="quick-open-list" data-testid="quick-open-list">
      <div
        v-for="(item, index) in items"
        :key="item.path"
        class="quick-open-item"
        :class="{ active: index === active }"
        :title="item.path"
        @mousemove="active = index"
        @click="open(item.path)"
      >
        <span class="quick-open-name"
          ><template v-for="(part, at) in hitSegments(item.name, item.nameHits)" :key="at"
            ><mark v-if="part.hit">{{ part.text }}</mark
            ><template v-else>{{ part.text }}</template></template
          ></span
        >
        <span v-if="item.directory" class="quick-open-directory"
          ><template v-for="(part, at) in hitSegments(item.directory, item.directoryHits)" :key="at"
            ><mark v-if="part.hit">{{ part.text }}</mark
            ><template v-else>{{ part.text }}</template></template
          ></span
        >
      </div>
      <div v-if="!items.length" class="quick-open-empty">{{ query ? t("common.notFound") : workspace ? t("quickOpen.emptyWorkspace") : t("quickOpen.emptyRecent") }}</div>
    </div>
  </ElDialog>
</template>

<script setup lang="ts">
// 快速打开（F-4）：Ctrl+P，输入文件名的一部分，从工作区的 Markdown 文件里找（没有工作区时从最近文件里找）；
// ↑ ↓ 选择，回车打开（F-3 的窗口规则），Esc 关闭；最多列 30 个
import type { RecentFile } from "@marko/shared";
import { computed, nextTick, ref, watch } from "vue";
import type { WorkspaceFile } from "../composables/useWorkspace.ts";
import { hitSegments, quickOpenCandidates, quickOpenItems } from "../quickOpen.ts";
import { t } from "../i18n.ts";

const props = defineProps<{ visible: boolean; workspace: boolean; files: WorkspaceFile[]; recent: RecentFile[] }>();
const emit = defineEmits<{ "update:visible": [visible: boolean]; open: [path: string] }>();

const query = ref("");
const active = ref(0);
const input = ref<{ focus: () => void } | null>(null);
const list = ref<HTMLElement | null>(null);

const candidates = computed(() => quickOpenCandidates(props.workspace ? props.files : null, props.recent));
const items = computed(() => quickOpenItems(candidates.value, query.value));

watch(items, () => {
  active.value = 0;
});

watch(
  () => props.visible,
  (visible) => {
    if (visible) query.value = "";
  },
);

function focus(): void {
  input.value?.focus();
}

function open(path: string): void {
  emit("update:visible", false);
  emit("open", path);
}

function move(step: number): void {
  const count = items.value.length;
  if (!count) return;
  active.value = (active.value + step + count) % count;
  void nextTick(() => list.value?.children[active.value]?.scrollIntoView({ block: "nearest" }));
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
  } else if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    const item = items.value[active.value];
    if (item) open(item.path);
  }
}
</script>

<style>
.marko-quick-open .el-dialog__header {
  display: none;
}

.marko-quick-open .el-dialog__body {
  padding: 0;
}

.marko-quick-open .quick-open-list {
  max-height: 50vh;
  margin-top: 8px;
  overflow: auto;
}

.marko-quick-open .quick-open-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.marko-quick-open .quick-open-item.active {
  background: var(--el-color-primary-light-9);
}

.marko-quick-open .quick-open-name {
  flex: none;
  color: var(--el-text-color-primary);
}

.marko-quick-open .quick-open-directory {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marko-quick-open mark {
  background: none;
  color: var(--el-color-primary);
  font-weight: 600;
}

.marko-quick-open .quick-open-empty {
  padding: 16px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
