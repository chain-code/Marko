<template>
  <div class="search-panel" data-testid="search-panel">
    <div v-if="!root" class="search-empty">
      <ElEmpty :description="t('search.needFolder')" :image-size="60">
        <ElButton type="primary" size="small" @click="emit('openFolder')">{{ t("common.openFolder") }}</ElButton>
      </ElEmpty>
    </div>
    <template v-else>
      <div class="search-form">
        <ElInput
          ref="input"
          v-model="query"
          size="small"
          :placeholder="t('search.placeholder')"
          clearable
          data-testid="search-input"
          @keydown.enter.prevent="run"
          @keydown.esc.prevent="cancel"
        />
        <div class="search-options">
          <ElTooltip :content="t('common.caseSensitive')" placement="top" :show-after="400">
            <ElButton size="small" :type="caseSensitive ? 'primary' : 'default'" text bg :aria-label="t('common.caseSensitive')" @click="caseSensitive = !caseSensitive">Aa</ElButton>
          </ElTooltip>
          <ElTooltip :content="t('common.wholeWord')" placement="top" :show-after="400">
            <ElButton size="small" :type="wholeWord ? 'primary' : 'default'" text bg :aria-label="t('common.wholeWord')" @click="wholeWord = !wholeWord">ab</ElButton>
          </ElTooltip>
          <ElTooltip :content="t('common.regex')" placement="top" :show-after="400">
            <ElButton size="small" :type="regexp ? 'primary' : 'default'" text bg :aria-label="t('common.regex')" @click="regexp = !regexp">.*</ElButton>
          </ElTooltip>
        </div>
      </div>
      <div v-if="statusText" class="search-status" data-testid="search-status">
        <span :class="{ 'search-error': !!error }">{{ statusText }}</span>
        <ElButton v-if="searching" link type="primary" size="small" data-testid="search-cancel" @click="cancel">{{ t("common.cancel") }}</ElButton>
      </div>
      <div ref="box" class="search-results">
        <ElTreeV2
          v-if="height > 0 && nodes.length"
          ref="tree"
          :data="nodes"
          :height="height"
          :item-size="26"
          :props="{ value: 'key', label: 'label', children: 'children' }"
          :default-expanded-keys="expandedKeys"
          :expand-on-click-node="true"
          @node-click="onClick"
          @node-collapse="(data: ResultNode) => collapsed.add(data.key)"
          @node-expand="(data: ResultNode) => collapsed.delete(data.key)"
        >
          <template #default="{ data }">
            <span v-if="data.match" class="search-line" :title="data.match.preview">
              <span class="search-line-number">{{ data.match.line }}</span>
              <span class="search-line-text"
                ><template v-for="(part, index) in segments(data.match)" :key="index"
                  ><mark v-if="part.hit" class="search-hit">{{ part.text }}</mark
                  ><template v-else>{{ part.text }}</template></template
                ></span
              >
            </span>
            <span v-else class="search-file" :title="data.path">
              <span class="search-file-name">{{ data.label }}</span>
              <span v-if="data.directory" class="search-file-directory">{{ data.directory }}</span>
              <span class="search-file-count" :title="data.truncated ? t('search.fileTruncated', { count: data.count ?? 0 }) : ''">{{ data.truncated ? `${data.count}+` : data.count }}</span>
            </span>
          </template>
        </ElTreeV2>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// 全局搜索（W-5）：在工作区的 Markdown 文件里搜（主进程调 ripgrep，结果分批推回来，边搜边显示，可以中途取消）。
// 结果按文件分组，每条显示行号和那一行的片段，关键字高亮；点一条在这个窗口里打开文件并选中那一处
import { EVENTS, type MarkoApi, type SearchFileResult, type SearchMatch } from "@marko/shared";
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { basename, dirname } from "../../paths.ts";
import { t } from "../../i18n.ts";

interface ResultNode {
  key: string;
  label: string;
  path: string;
  directory?: string;
  count?: number;
  /** 这个文件只列了前面的（W-5） */
  truncated?: boolean;
  match?: SearchMatch;
  children?: ResultNode[];
}

const props = defineProps<{ api: MarkoApi; root: string | null }>();
const emit = defineEmits<{ openFolder: []; openMatch: [path: string, match: SearchMatch] }>();

const query = ref("");
const caseSensitive = ref(false);
const wholeWord = ref(false);
const regexp = ref(false);
const results = shallowRef<SearchFileResult[]>([]);
const searching = ref(false);
const truncated = ref(false);
const error = ref<string | null>(null);
const cancelled = ref(false);
/** 搜过一次（有结果或者没找到，才显示状态） */
const searched = ref(false);
const collapsed = new Set<string>();

let currentId = 0;

const total = computed(() => results.value.reduce((sum, file) => sum + file.matches.length, 0));

const statusText = computed(() => {
  if (error.value) return error.value;
  if (searching.value) return total.value ? t("search.searchingCount", { total: total.value }) : t("search.searching");
  if (!searched.value) return "";
  const found = total.value ? t("search.summary", { files: results.value.length, total: total.value }) : cancelled.value ? "" : t("common.notFound");
  if (cancelled.value) return found ? t("search.cancelledWith", { summary: found }) : t("search.cancelled");
  return truncated.value ? t("search.truncated", { summary: found, total: total.value }) : found;
});

/** 文件所在目录相对工作区的路径 */
function relativeDirectory(path: string): string {
  const root = props.root ?? "";
  const directory = dirname(path);
  if (directory.length <= root.length) return "";
  return directory.slice(root.length).replace(/^[\\/]+/, "");
}

const nodes = computed<ResultNode[]>(() =>
  results.value.map((file) => ({
    key: file.path,
    label: basename(file.path),
    path: file.path,
    directory: relativeDirectory(file.path),
    count: file.matches.length,
    truncated: file.truncated,
    children: file.matches.map((match, index) => ({ key: `${file.path}\n${index}`, label: match.preview, path: file.path, match })),
  })),
);

const tree = ref<{ setExpandedKeys: (keys: string[]) => void } | null>(null);

/** 文件默认展开，用户收起的保持收起 */
const expandedKeys = computed(() => nodes.value.filter((node) => !collapsed.has(node.key)).map((node) => node.key));

// 结果一批批来：新来的文件也展开
watch(
  expandedKeys,
  async (keys) => {
    await nextTick();
    tree.value?.setExpandedKeys(keys);
  },
  { flush: "post" },
);

function segments(match: SearchMatch): Array<{ text: string; hit: boolean }> {
  const parts: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (const [from, to] of match.ranges) {
    if (from > at) parts.push({ text: match.preview.slice(at, from), hit: false });
    parts.push({ text: match.preview.slice(from, to), hit: true });
    at = to;
  }
  if (at < match.preview.length) parts.push({ text: match.preview.slice(at), hit: false });
  return parts;
}

function reset(): void {
  results.value = [];
  collapsed.clear();
  truncated.value = false;
  error.value = null;
  cancelled.value = false;
}

async function run(): Promise<void> {
  const text = query.value;
  const root = props.root;
  if (!root) return;
  if (searching.value) await props.api.search.cancel(currentId);
  currentId += 1;
  reset();
  if (!text) {
    searching.value = false;
    searched.value = false;
    return;
  }
  if (regexp.value) {
    try {
      new RegExp(text, "u");
    } catch {
      error.value = t("common.badRegex");
      searching.value = false;
      return;
    }
  }
  searching.value = true;
  searched.value = true;
  const result = await props.api.search.start({
    id: currentId,
    root,
    query: text,
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    regexp: regexp.value,
  });
  if (!result.ok) {
    searching.value = false;
    error.value = t("search.failed", { message: result.error.message });
  }
}

async function cancel(): Promise<void> {
  if (!searching.value) return;
  await props.api.search.cancel(currentId);
  searching.value = false;
  cancelled.value = true;
}

// 边输入边搜：停下 300ms 再搜；回车马上搜；开关变了马上重搜
let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(() => void run(), 300);
});
watch([caseSensitive, wholeWord, regexp], () => {
  clearTimeout(timer);
  void run();
});
// 换了工作区：清掉结果
watch(
  () => props.root,
  () => {
    clearTimeout(timer);
    if (searching.value) void props.api.search.cancel(currentId);
    currentId += 1;
    searching.value = false;
    searched.value = false;
    reset();
  },
);

function onClick(data: ResultNode): void {
  if (data.match) emit("openMatch", data.path, data.match);
}

const offResults = props.api.on(EVENTS.searchResults, ({ id, files }) => {
  if (id === currentId && searching.value) results.value = [...results.value, ...files];
});
const offDone = props.api.on(EVENTS.searchDone, (done) => {
  if (done.id !== currentId) return;
  searching.value = false;
  truncated.value = done.truncated;
  if (done.error) error.value = t("search.error", { message: done.error });
});

// 结果区的高度（ElTreeV2 要具体的高度）
const box = ref<HTMLElement | null>(null);
const height = ref(0);
let observer: ResizeObserver | null = null;
watch(box, (element) => {
  observer?.disconnect();
  if (!element) return;
  observer = new ResizeObserver(([entry]) => {
    height.value = Math.floor(entry.contentRect.height);
  });
  observer.observe(element);
});

const input = ref<{ focus: () => void; select: () => void } | null>(null);

/** Ctrl+Shift+F：焦点放进搜索框，框里的字全选 */
function focus(): void {
  void nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
}

onBeforeUnmount(() => {
  clearTimeout(timer);
  observer?.disconnect();
  offResults();
  offDone();
  if (searching.value) void props.api.search.cancel(currentId);
});

defineExpose({ focus });
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-empty {
  flex: 1;
}

.search-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.search-options {
  display: flex;
  gap: 4px;
}

.search-options .el-button + .el-button {
  margin-left: 0;
}

.search-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.search-error {
  color: var(--el-color-danger);
  white-space: pre-wrap;
}

.search-results {
  flex: 1;
  min-height: 0;
}

.search-file,
.search-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.search-file-name {
  font-weight: 500;
}

.search-file-directory,
.search-line-number {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.search-file-directory {
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-file-count {
  margin-left: auto;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.search-line-number {
  flex: none;
  min-width: 2em;
  text-align: right;
}

.search-line-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-hit {
  border-radius: 2px;
  background: var(--md-search-match, rgba(255, 213, 0, 0.4));
  color: inherit;
}
</style>
