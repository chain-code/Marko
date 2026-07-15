<template>
  <li class="tree-node" role="none">
    <button
      ref="rowRef"
      type="button"
      class="tree-row"
      :class="{ active: isCurrent, folder: entry.isDir, 'contains-current': isCurrentBranch && entry.isDir }"
      role="treeitem"
      :aria-level="depth"
      :aria-expanded="entry.isDir ? open : undefined"
      :aria-selected="isCurrent"
      :aria-current="isCurrent ? 'page' : undefined"
      :tabindex="isCurrent || initialTabbable ? 0 : -1"
      @click="handleClick"
      @keydown="handleKeydown"
      @contextmenu.prevent.stop="handleContextMenu"
    >
      <ChevronRight v-if="entry.isDir" class="chevron" :class="{ open }" />
      <FileText v-else class="file-icon" />
      <span class="tree-name" :title="entry.path">{{ entry.name }}</span>
    </button>
    <ul v-if="entry.isDir && open" class="tree-children" role="group">
      <FileTreeNode
        v-for="child in entry.children"
        :key="child.path"
        :entry="child"
        :current-path="currentPath"
        :depth="depth + 1"
        @open-file="$emit('openFile', $event)"
        @context-file="(target, event) => emit('contextFile', target, event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ChevronRight, FileText } from "lucide-vue-next";
import type { FileEntry, SidebarFileContextTarget } from "@/types";
import { fileTreeEntryContainsPath, isSameTreePath } from "@/utils/fileTree";
import { resolveFileTreeKey } from "@/utils/fileTreeKeyboard";

const props = withDefaults(defineProps<{
  entry: FileEntry;
  currentPath?: string;
  depth?: number;
  initialTabbable?: boolean;
}>(), {
  depth: 1,
  initialTabbable: false,
});

const emit = defineEmits<{
  openFile: [path: string];
  contextFile: [target: SidebarFileContextTarget, event: MouseEvent | KeyboardEvent];
}>();

const rowRef = ref<HTMLButtonElement | null>(null);
const isCurrent = computed(() => isSameTreePath(props.entry.path, props.currentPath));
const isCurrentBranch = computed(() => fileTreeEntryContainsPath(props.entry, props.currentPath));
const open = ref(!props.entry.isDir || isCurrentBranch.value);

watch(
  isCurrentBranch,
  (value) => {
    if (props.entry.isDir && value) open.value = true;
  },
  { immediate: true },
);

watch(
  isCurrent,
  async (value) => {
    if (!value) return;
    await nextTick();
    rowRef.value?.scrollIntoView({ block: "nearest" });
  },
  { immediate: true },
);

function handleClick() {
  setRovingFocus(rowRef.value);
  if (props.entry.isDir) {
    open.value = !open.value;
    nextTick(() => setRovingFocus(rowRef.value));
    return;
  }
  emit("openFile", props.entry.path);
}

async function handleKeydown(event: KeyboardEvent) {
  const row = rowRef.value;
  if (!row) return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    event.stopPropagation();
    setRovingFocus(row);
    emitContextFile(event);
    return;
  }
  const action = resolveFileTreeKey(event.key, {
    isDirectory: props.entry.isDir,
    expanded: open.value,
    hasChildren: props.entry.children.length > 0,
    hasParent: Boolean(findParentTreeItem(row)),
  });
  if (!action) return;

  event.preventDefault();
  const items = getTreeItems(row);
  const index = items.indexOf(row);
  if (action === "previous") setRovingFocus(items[Math.max(0, index - 1)]);
  else if (action === "next") setRovingFocus(items[Math.min(items.length - 1, index + 1)]);
  else if (action === "first") setRovingFocus(items[0]);
  else if (action === "last") setRovingFocus(items.at(-1));
  else if (action === "parent") setRovingFocus(findParentTreeItem(row));
  else if (action === "child") setRovingFocus(findFirstChildTreeItem(row));
  else if (action === "expand") {
    open.value = true;
    await nextTick();
    setRovingFocus(row);
  } else if (action === "collapse") {
    open.value = false;
    await nextTick();
    setRovingFocus(row);
  } else if (action === "activate") {
    handleClick();
  }
}

function getTreeItems(row: HTMLButtonElement): HTMLButtonElement[] {
  const tree = row.closest<HTMLElement>("[role='tree']");
  return tree ? Array.from(tree.querySelectorAll<HTMLButtonElement>("[role='treeitem']")) : [row];
}

function setRovingFocus(target: HTMLButtonElement | null | undefined) {
  if (!target) return;
  for (const item of getTreeItems(target)) item.tabIndex = item === target ? 0 : -1;
  target.focus();
}

function findParentTreeItem(row: HTMLButtonElement): HTMLButtonElement | null {
  const node = row.closest<HTMLLIElement>(".tree-node");
  const parentNode = node?.parentElement?.closest<HTMLLIElement>(".tree-node");
  const candidate = parentNode?.firstElementChild;
  return candidate instanceof HTMLButtonElement ? candidate : null;
}

function findFirstChildTreeItem(row: HTMLButtonElement): HTMLButtonElement | null {
  const node = row.closest<HTMLLIElement>(".tree-node");
  const group = Array.from(node?.children ?? []).find((child) => child.getAttribute("role") === "group");
  return group?.querySelector<HTMLButtonElement>("[role='treeitem']") ?? null;
}

function handleContextMenu(event: MouseEvent) {
  setRovingFocus(rowRef.value);
  emitContextFile(event);
}

function emitContextFile(event: MouseEvent | KeyboardEvent) {
  emit("contextFile", {
    path: props.entry.path,
    name: props.entry.name,
    isDir: props.entry.isDir,
    source: "tree",
  }, event);
}
</script>

<style scoped>
.tree-node {
  list-style: none;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 0.32rem;
  width: 100%;
  min-width: 0;
  min-height: 28px;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.22rem 0.38rem;
  text-align: left;
}

.tree-row:hover,
.tree-row.active,
.tree-row:focus-visible {
  background: var(--hover);
  color: var(--text);
}

.tree-row:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-strong) 62%, transparent);
  outline-offset: -2px;
}

.tree-row.contains-current:not(.active) {
  color: var(--text);
  font-weight: 560;
}

.chevron,
.file-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--muted);
}

.chevron {
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.tree-name {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-children {
  margin: 0;
  padding: 0 0 0 0.86rem;
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
