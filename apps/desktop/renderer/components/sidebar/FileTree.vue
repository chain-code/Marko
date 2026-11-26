<template>
  <div ref="box" class="file-tree" data-testid="file-tree" tabindex="0" @keydown="onKeydown">
    <ElTreeV2
      v-if="height > 0"
      ref="tree"
      :data="treeData"
      :height="height"
      :item-size="29"
      :indent="8"
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
        <span class="file-node" :class="{ 'is-folder': data.kind === 'folder', 'is-root': data.path === root }" :title="data.path">
          <!-- 子文件夹前面是展开的箭头，文件和根文件夹前面空着（同 Typora） -->
          <span class="file-node-state">
            <svg v-if="data.kind === 'folder' && data.path !== root" viewBox="0 0 8 8" :class="{ 'is-open': expanded.has(data.path) }" aria-hidden="true"><path d="M2 1 L6 4 L2 7 Z" /></svg>
          </span>
          <svg v-if="data.kind === 'folder'" class="file-node-icon" viewBox="0 0 14 12" aria-hidden="true"><path d="M0.5 1.5 Q0.5 0.5 1.5 0.5 H5 L6.5 2 H12.5 Q13.5 2 13.5 3 V10.5 Q13.5 11.5 12.5 11.5 H1.5 Q0.5 11.5 0.5 10.5 Z" /></svg>
          <svg v-else class="file-node-icon is-file" viewBox="0 0 12 14" aria-hidden="true"><path d="M1 0.5 H7.5 L11 4 V13.5 H1 Z M7.5 0.5 V4 H11" /><path d="M3 7 H9 M3 9.5 H9" /></svg>
          <span class="file-node-label" :class="{ 'file-tree-item': data.path !== root, 'file-tree-root': data.path === root }"><span class="file-node-name">{{ stemOf(data) }}</span><span class="file-node-ext">{{ extensionOf(data) }}</span></span>
        </span>
      </template>
    </ElTreeV2>
  </div>
</template>

<script setup lang="ts">
// 文件树（W-2，样子同 Typora）：最上面是工作区的根文件夹，下面是里面的文件夹和 Markdown 文件，文件夹在前、按名称的自然顺序（主进程排好）；
// 点文件按 F-3 打开；当前文件灰底、左边一条线。ElTreeV2（虚拟滚动，大文件夹也不卡）没有的自己补：数据变了（工作区刷新）它把展开的
// 文件夹全收起来——记住展开了哪些交回给它；键盘 ↑ ↓ 移动、→ 展开或进到第一项、← 收起或回到上一层、回车打开文件或展开收起；
// 「在文件树中定位」（reveal）
import type { WorkspaceEntry } from "@marko/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { basename } from "../../paths.ts";

const props = defineProps<{ root: string; entries: WorkspaceEntry[]; current: string | null }>();
const emit = defineEmits<{ open: [path: string]; contextmenu: [entry: WorkspaceEntry] }>();

interface TreeHandle {
  getNode(key: string): unknown;
  expandNode(node: unknown): void;
  collapseNode(node: unknown): void;
  setCurrentKey(key: string): void;
  getCurrentKey(): string | undefined;
  scrollToNode(key: string, strategy?: "auto" | "smart" | "center" | "start" | "end"): void;
}

/** 根文件夹也是一项（同 Typora），里面是工作区的文件夹和文件 */
const treeData = computed<WorkspaceEntry[]>(() => [{ kind: "folder", name: basename(props.root) || props.root, path: props.root, children: props.entries } as WorkspaceEntry]);

function stemOf(entry: WorkspaceEntry): string {
  if (entry.kind === "folder") return entry.name;
  const dot = entry.name.lastIndexOf(".");
  return dot > 0 ? entry.name.slice(0, dot) : entry.name;
}

function extensionOf(entry: WorkspaceEntry): string {
  if (entry.kind === "folder") return "";
  const dot = entry.name.lastIndexOf(".");
  return dot > 0 ? entry.name.slice(dot) : "";
}

const box = ref<HTMLElement | null>(null);
const tree = ref<TreeHandle | null>(null);
const height = ref(0);
/** 展开了的文件夹；根文件夹一开始就展开 */
const expanded = ref(new Set<string>([props.root]));
watch(
  () => props.root,
  (root) => {
    if (!expanded.value.has(root)) expanded.value = new Set([...expanded.value, root]);
  },
);
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
  walk(treeData.value, null);
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
  walk(treeData.value);
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
  walk(treeData.value);
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

/** 「在侧边栏中显示」：展开到这个文件，选中、滚到看得见；不在工作区里返回 false */
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
/* 样子同 Typora 的文件树：行高 29px，每层缩进 8px；字是灰的，当前文件灰底、黑字、左边一条线 */
.file-tree {
  height: 100%;
  overflow: hidden;
  outline: none;
  color: var(--app-file-text, #777);
}

.file-tree :deep(.el-tree) {
  background: transparent;
  color: inherit;
  font-size: 14px;
}

.file-tree :deep(.el-tree-node__expand-icon) {
  display: none;
}

.file-tree :deep(.el-tree-node__content) {
  padding-left: 8px;
}

.file-tree :deep(.el-tree-node__content:hover) {
  background: var(--app-item-hover, rgba(229, 229, 229, 0.59));
}

.file-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--app-active-file, #eee);
  box-shadow: inset 4px 0 0 var(--app-active-file-border, #777);
  color: var(--md-text, #333);
}

.file-node {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.file-node-state {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 8px;
  margin-left: 8px;
}

.file-node.is-root .file-node-state {
  display: none;
}

.file-node-state svg {
  width: 7px;
  height: 7px;
  fill: currentColor;
  transition: transform 0.15s;
}

.file-node-state svg.is-open {
  transform: rotate(90deg);
}

.file-node-icon {
  flex: none;
  width: 13px;
  height: 12px;
  margin: 0 4px 0 0;
  fill: currentColor;
}

.file-node.is-root .file-node-icon {
  margin-left: 8px;
}

.file-node-icon.is-file {
  width: 11px;
  height: 13px;
  margin-left: 2px;
  margin-right: 5px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
}

.file-node-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
