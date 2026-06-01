<template>
  <li class="tree-node">
    <button
      type="button"
      class="tree-row"
      :class="{ active: entry.path === currentPath, folder: entry.isDir }"
      @click="handleClick"
    >
      <ChevronRight v-if="entry.isDir" class="chevron" :class="{ open }" />
      <FileText v-else class="file-icon" />
      <span class="tree-name" :title="entry.path">{{ entry.name }}</span>
    </button>
    <ul v-if="entry.isDir && open" class="tree-children">
      <FileTreeNode
        v-for="child in entry.children"
        :key="child.path"
        :entry="child"
        :current-path="currentPath"
        @open-file="$emit('openFile', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronRight, FileText } from "lucide-vue-next";
import type { FileEntry } from "@/types";

const props = defineProps<{
  entry: FileEntry;
  currentPath?: string;
}>();

const emit = defineEmits<{
  openFile: [path: string];
}>();

const open = ref(true);

function handleClick() {
  if (props.entry.isDir) {
    open.value = !open.value;
    return;
  }
  emit("openFile", props.entry.path);
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
  min-height: 28px;
  min-width: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.25rem 0.38rem;
  text-align: left;
}

.tree-row:hover,
.tree-row.active {
  background: var(--hover);
  color: var(--text);
}

.chevron,
.file-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--muted);
}

.chevron {
  transition: transform 0.16s ease;
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
  padding: 0 0 0 0.85rem;
}
</style>
