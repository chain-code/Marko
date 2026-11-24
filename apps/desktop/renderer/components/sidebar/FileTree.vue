<template>
  <div ref="box" class="file-tree" data-testid="file-tree" tabindex="0" @keydown="onKeydown">
    <ElTreeV2
      v-if="height > 0"
      ref="tree"
      :data="entries"
      :height="height"
      :item-size="26"
      :props="{ value: 'path', label: 'name', children: 'children' }"
      :current-node-key="current ?? undefined"
      :default-expanded-keys="expandedKeys"
      :highlight-current="true"
      :expand-on-click-node="true"
      @node-click="onClick"
      @node-expand="(data: WorkspaceEntry) => setExpanded(data.path, true)"
      @node-collapse="(data: WorkspaceEntry) => setExpanded(data.path, false)"
      @node-contextmenu="onContextMenu"
    >
      <template #default="{ data }">
        <span class="file-tree-item" :class="{ folder: data.kind === 'folder' }" :title="data.path">{{ data.name }}</span>
      </template>
    </ElTreeV2>
  </div>
</template>

<script setup lang="ts">
// 文件树（W-2）：ElTreeV2（虚拟滚动，大文件夹也不卡），文件夹在前、按名称的自然顺序（主进程排好）；点文件按 F-3 打开；当前文件高亮。
// ElTreeV2 没有的自己补：数据变了（工作区刷新）它把展开的文件夹全收起来——记住展开了哪些交回给它；
// 键盘 ↑ ↓ 移动、→ 展开或进到第一项、← 收起或回到上一层、回车打开文件或展开收起；「在文件树中定位」（reveal）
import type { WorkspaceEntry } from "@marko/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ entries: WorkspaceEntry[]; current: string | null }>();
const emit = defineEmits<{ open: [path: string]; contextmenu: [entry: WorkspaceEntry] }>();

interface TreeHandle {
  getNode(key: string): unknown;
  expandNode(node: unknown): void;
  collapseNode(node: unknown): void;
  setCurrentKey(key: string): void;
  getCurrentKey(): string | undefined;
  scrollToNode(key: string, strategy?: "auto" | "smart" | "center" | "start" | "end"): void;
}

const box = ref<HTMLElement | null>(null);
const tree = ref<TreeHandle | null>(null);
const height = ref(0);
const expanded = ref(new Set<string>());
/**
 * 交给 ElTreeV2 的：只给上层都开着的（它会把给的键的上层一起展开——收起 notes 时里面开着的 deep 不能把 notes 又撑开）；
 * 自己记着全部，再打开 notes 时 deep 照样是开的
 */
const expandedKeys = computed(() =>
  [...expanded.value].filter((path) => {
    for (let parent = parents.value.get(path); parent; parent = parents.value.get(parent)) if (!expanded.value.has(parent)) return false;
    return true;
  }),
);
/** 键盘停在哪一项 */
let cursor: string | null = null;
let observer: ResizeObserver | null = null;

function setExpanded(path: string, open: boolean): void {
  const next = new Set(expanded.value);
  if (open) next.add(path);
  else next.delete(path);
  expanded.value = next;
}

/** 每一项的上一层文件夹（← 回到上一层、定位时展开） */
const parents = computed(() => {
  const map = new Map<string, string>();
  const walk = (entries: WorkspaceEntry[], parent: string | null) => {
    for (const entry of entries) {
      if (parent) map.set(entry.path, parent);
      if (entry.children) walk(entry.children, entry.path);
    }
  };
  walk(props.entries, null);
  return map;
});

const byPath = computed(() => {
  const map = new Map<string, WorkspaceEntry>();
  const walk = (entries: WorkspaceEntry[]) => {
    for (const entry of entries) {
      map.set(entry.path, entry);
      if (entry.children) walk(entry.children);
    }
  };
  walk(props.entries);
  return map;
});

/** 现在看得见的项，从上到下（收起的文件夹里面的不算） */
function visible(): WorkspaceEntry[] {
  const out: WorkspaceEntry[] = [];
  const walk = (entries: WorkspaceEntry[]) => {
    for (const entry of entries) {
      out.push(entry);
      if (entry.children && expanded.value.has(entry.path)) walk(entry.children);
    }
  };
  walk(props.entries);
  return out;
}

function moveTo(path: string): void {
  cursor = path;
  tree.value?.setCurrentKey(path);
  tree.value?.scrollToNode(path, "auto");
}

function toggle(entry: WorkspaceEntry, open: boolean): void {
  const node = tree.value?.getNode(entry.path);
  if (!node) return;
  if (open) tree.value?.expandNode(node);
  else tree.value?.collapseNode(node);
  setExpanded(entry.path, open);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const items = visible();
  if (!items.length) return;
  const at = cursor ?? tree.value?.getCurrentKey() ?? props.current;
  const index = items.findIndex((entry) => entry.path === at);
  const entry = index >= 0 ? items[index] : undefined;
  switch (event.key) {
    case "ArrowDown":
      moveTo(items[Math.min(items.length - 1, index + 1)].path);
      break;
    case "ArrowUp":
      moveTo(items[Math.max(0, index - 1)].path);
      break;
    case "ArrowRight":
      if (entry?.kind !== "folder") return;
      if (!expanded.value.has(entry.path)) toggle(entry, true);
      else if (entry.children?.length) moveTo(entry.children[0].path);
      break;
    case "ArrowLeft": {
      if (!entry) return;
      if (entry.kind === "folder" && expanded.value.has(entry.path)) toggle(entry, false);
      else {
        const parent = parents.value.get(entry.path);
        if (parent) moveTo(parent);
      }
      break;
    }
    case "Enter":
      if (!entry) return;
      if (entry.kind === "file") emit("open", entry.path);
      else toggle(entry, !expanded.value.has(entry.path));
      break;
    default:
      return;
  }
  event.preventDefault();
}

function onClick(data: WorkspaceEntry): void {
  cursor = data.path;
  box.value?.focus({ preventScroll: true });
  if (data.kind === "file") emit("open", data.path);
}

/** 右键（W-6）：不要网页默认的菜单，交给侧栏弹原生菜单 */
function onContextMenu(event: Event, data: WorkspaceEntry): void {
  event.preventDefault();
  emit("contextmenu", data);
}

/** 「视图 → 在文件树中定位」：展开到这个文件，选中、滚到看得见；不在工作区里返回 false */
async function reveal(path: string): Promise<boolean> {
  if (!byPath.value.has(path)) return false;
  const next = new Set(expanded.value);
  for (let parent = parents.value.get(path); parent; parent = parents.value.get(parent)) next.add(parent);
  expanded.value = next;
  await nextTick();
  moveTo(path);
  box.value?.focus({ preventScroll: true });
  return true;
}

defineExpose({ reveal });

onMounted(() => {
  if (!box.value) return;
  observer = new ResizeObserver(([entry]) => {
    height.value = Math.floor(entry.contentRect.height);
  });
  observer.observe(box.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.file-tree {
  height: 100%;
  overflow: hidden;
  outline: none;
}

.file-tree-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-item.folder {
  font-weight: 500;
}
</style>
