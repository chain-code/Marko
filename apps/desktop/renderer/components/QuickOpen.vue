<template>
  <ElDialog
    :model-value="visible"
    class="marko-quick-open"
    modal-class="marko-quick-open-modal"
    width="420px"
    top="0"
    :show-close="false"
    destroy-on-close
    @update:model-value="(value: boolean) => emit('update:visible', value)"
    @opened="focus"
  >
    <!-- 样子同 Typora：贴着窗口顶部的浅灰面板，上面一个输入框，下面分「最近打开的文件」「匹配的文件」两组，每项两行：文件名、所在目录 -->
    <input
      ref="input"
      v-model="query"
      class="quick-open-input"
      type="text"
      spellcheck="false"
      autocomplete="off"
      :placeholder="t('quickOpen.placeholder')"
      data-testid="quick-open-input"
      @keydown="onKeydown"
    />
    <div ref="list" class="quick-open-list" data-testid="quick-open-list">
      <template v-for="group in groups" :key="group.id">
        <div class="quick-open-category" :class="{ 'has-prev': group.first > 0 }">{{ group.id === "recent" ? t("quickOpen.recentFiles") : t("quickOpen.matchedFiles") }}</div>
        <div
          v-for="(item, offset) in group.items"
          :key="item.path"
          class="quick-open-item"
          :class="{ active: group.first + offset === active }"
          :data-index="group.first + offset"
          :title="item.path"
          @mousemove="active = group.first + offset"
          @click="open(item.path)"
        >
          <div class="quick-open-name">
            <template v-for="(part, at) in hitSegments(item.name, item.nameHits)" :key="at"
              ><mark v-if="part.hit">{{ part.text }}</mark
              ><template v-else>{{ part.text }}</template></template
            >
          </div>
          <div class="quick-open-directory">
            <template v-for="(part, at) in hitSegments(item.directory, item.directoryHits)" :key="at"
              ><mark v-if="part.hit">{{ part.text }}</mark
              ><template v-else>{{ part.text }}</template></template
            >
          </div>
        </div>
      </template>
      <div v-if="!items.length" class="quick-open-empty">{{ query ? t("common.notFound") : workspace ? t("quickOpen.emptyWorkspace") : t("quickOpen.emptyRecent") }}</div>
    </div>
  </ElDialog>
</template>

<script setup lang="ts">
// 快速打开（F-4）：Ctrl+P，输入文件名的一部分，从工作区的 Markdown 文件里找（没有工作区时从最近文件里找）；
// 最近打开过的放在「最近打开的文件」一组，其余在「匹配的文件」（同 Typora）；↑ ↓ 选择，回车打开（F-3 的窗口规则），Esc 关闭；最多列 30 个
import type { RecentFile } from "@marko/shared";
import { computed, nextTick, ref, watch } from "vue";
import type { WorkspaceFile } from "../composables/useWorkspace.ts";
import { hitSegments, quickOpenCandidates, quickOpenItems, type QuickOpenItem } from "../quickOpen.ts";
import { t } from "../i18n.ts";

const props = defineProps<{ visible: boolean; workspace: boolean; files: WorkspaceFile[]; recent: RecentFile[] }>();
const emit = defineEmits<{ "update:visible": [visible: boolean]; open: [path: string] }>();

const query = ref("");
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const candidates = computed(() => quickOpenCandidates(props.workspace ? props.files : null, props.recent));
const ranked = computed(() => quickOpenItems(candidates.value, query.value));

/** 两组：最近打开过的、其余的；各自保持排好的顺序 */
const groups = computed(() => {
  const recent = ranked.value.filter((item) => item.recent !== Infinity);
  const others = ranked.value.filter((item) => item.recent === Infinity);
  const result: Array<{ id: "recent" | "matched"; first: number; items: QuickOpenItem[] }> = [];
  if (recent.length) result.push({ id: "recent", first: 0, items: recent });
  if (others.length) result.push({ id: "matched", first: recent.length, items: others });
  return result;
});

/** 按显示的顺序（↑ ↓ 和回车用） */
const items = computed(() => groups.value.flatMap((group) => group.items));

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
  void nextTick(() => list.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: "nearest" }));
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
/* 同 Typora 的 #typora-quick-open：420px 宽，贴着顶部，浅灰底、阴影，四周 4px；不压暗后面 */
.marko-quick-open-modal {
  background: transparent;
}

.marko-quick-open.el-dialog {
  margin-top: 0;
  padding: 4px;
  border-radius: 0;
  background: var(--app-sidebar, #f8f8f8);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  color: var(--md-text, #333);
  font-size: 13px;
}

.marko-quick-open .el-dialog__header {
  display: none;
}

.marko-quick-open .el-dialog__body {
  padding: 0;
  color: inherit;
}

.marko-quick-open .quick-open-input {
  box-sizing: border-box;
  width: 100%;
  max-height: 27px;
  padding: 0 0 0 5px;
  border: 1px solid var(--app-sidebar-border, #ddd);
  border-radius: 2px;
  outline: none;
  background: var(--md-background, #fff);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075);
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 25px;
}

.marko-quick-open .quick-open-list {
  max-height: 320px;
  overflow-x: hidden;
  overflow-y: auto;
  cursor: default;
}

.marko-quick-open .quick-open-category {
  height: 16px;
  margin-top: 4px;
  padding-left: 20px;
  overflow: hidden;
  font-size: 10px;
  line-height: 16px;
  opacity: 0.8;
}

.marko-quick-open .quick-open-category.has-prev {
  border-top: 1px solid var(--app-sidebar-border, #e9e9e9);
}

.marko-quick-open .quick-open-item {
  box-sizing: border-box;
  height: 40px;
  padding: 2px 0 0 20px;
  overflow: hidden;
  font-size: 14px;
}

.marko-quick-open .quick-open-item.active {
  background: var(--app-active-file, #eee);
}

.marko-quick-open .quick-open-name {
  max-height: 24px;
  overflow: hidden;
  line-height: 24px;
}

.marko-quick-open .quick-open-directory {
  width: 100%;
  margin-top: -4px;
  overflow: hidden;
  font-size: 11px;
  line-height: 14px;
  opacity: 0.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 命中的字加粗（Marko 多的） */
.marko-quick-open mark {
  background: none;
  color: inherit;
  font-weight: 700;
}

.marko-quick-open .quick-open-empty {
  padding-left: 20px;
  font-size: 12px;
  line-height: 40px;
  opacity: 0.7;
}
</style>
