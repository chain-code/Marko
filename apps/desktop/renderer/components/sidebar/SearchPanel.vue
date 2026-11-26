<template>
  <div class="search-panel" data-testid="search-panel">
    <!-- 没有打开文件夹：同 Typora 只显示一行字 -->
    <div v-if="!root" class="sidebar-hint is-shown">{{ t("sidebar.noFolder") }}</div>
    <template v-else>
      <!-- 搜索框（同 Typora）：三个开关在框里的右边 -->
      <div class="search-form">
        <input
          ref="input"
          v-model="query"
          type="search"
          class="search-input"
          :placeholder="t('search.placeholder')"
          spellcheck="false"
          autocomplete="off"
          data-testid="search-input"
          @keydown.enter.prevent="run"
          @keydown.esc.prevent="cancel"
        />
        <span class="search-option search-option-case" :class="{ active: caseSensitive }" role="button" :aria-pressed="caseSensitive" :aria-label="t('common.caseSensitive')" :title="t('common.caseSensitive')" @click="caseSensitive = !caseSensitive">Aa</span>
        <span class="search-option search-option-word" :class="{ active: wholeWord }" role="button" :aria-pressed="wholeWord" :aria-label="t('common.wholeWord')" :title="t('common.wholeWord')" @click="wholeWord = !wholeWord">
          <svg viewBox="0 0 20 14" aria-hidden="true"><path d="M3 9.5 h14 M3 9.5 v-3 M17 9.5 v-3" /><path d="M6.5 7.5 v-4 M9 7.5 v-4 M11.5 7.5 v-4 M14 7.5 v-4" /></svg>
        </span>
        <span class="search-option search-option-regex" :class="{ active: regexp }" role="button" :aria-pressed="regexp" :aria-label="t('common.regex')" :title="t('common.regex')" @click="regexp = !regexp">(.*)</span>
      </div>
      <!-- 搜到几处、正在搜、可以取消（Marko 多的，Typora 没有） -->
      <div v-if="statusText" class="search-status" data-testid="search-status">
        <span :class="{ 'search-error': !!error }">{{ statusText }}</span>
        <span v-if="searching" class="search-cancel" role="button" data-testid="search-cancel" @click="cancel">{{ t("common.cancel") }}</span>
      </div>
      <ElScrollbar class="search-results">
        <!-- 一个文件一组（同 Typora）：▾ 文件名（加粗）.扩展名、匹配数，所在目录；下面一处匹配一行原文 -->
        <div v-for="group in groups" :key="group.path" class="search-item" :class="{ active: active === group.path }" :data-path="group.path">
          <div class="search-file" :title="group.path" @click="openFile(group.path)">
            <span class="search-file-caret" role="button" :aria-expanded="state(group) !== 'collapsed'" @click.stop="toggle(group)">
              <svg v-if="state(group) === 'collapsed'" viewBox="0 0 8 10" aria-hidden="true"><path d="M2 1 L6.5 5 L2 9 Z" /></svg>
              <svg v-else viewBox="0 0 10 8" aria-hidden="true"><path d="M1 2 L9 2 L5 6.5 Z" /></svg>
            </span>
            <span class="search-file-name"><span class="search-file-stem">{{ group.stem }}</span><span class="search-file-ext">{{ group.extension }}</span></span>
            <span class="search-file-count" :title="group.truncated ? t('search.fileTruncated', { count: group.matches.length }) : ''">{{ group.truncated ? `${group.matches.length}+` : group.matches.length }}</span>
          </div>
          <template v-if="state(group) !== 'collapsed'">
            <div class="search-file-location">{{ group.location }}</div>
            <div class="search-matches">
              <div
                v-for="(match, index) in visibleMatches(group)"
                :key="index"
                class="search-line"
                :class="{ active: active === `${group.path}\n${index}` }"
                :title="t('search.lineTitle', { line: match.line })"
                @click="openMatch(group.path, match, index)"
                ><template v-for="(part, partIndex) in segments(match)" :key="partIndex"
                  ><mark v-if="part.hit" class="search-hit">{{ part.text }}</mark
                  ><span v-else>{{ part.text }}</span></template
                ></div
              >
              <div v-if="hiddenCount(group)" class="search-line search-more" role="button" @click="expanded.set(group.path, 'expanded')">{{ t("search.more", { count: hiddenCount(group) }) }}</div>
            </div>
          </template>
        </div>
      </ElScrollbar>
    </template>
  </div>
</template>

<script setup lang="ts">
// 侧栏的查找（W-5，样子同 Typora）：在工作区的 Markdown 文件里搜（主进程调 ripgrep，结果分批推回来，边搜边显示，可以中途取消）。
// 结果按文件分组：每个文件先列 5 行，多的点「再显示 N 处」展开（前面的文件加起来不到 30 处时直接全列）；
// 点文件名打开文件，点一行在这个窗口里打开文件并选中那一处，点箭头收起展开
import { EVENTS, type MarkoApi, type SearchFileResult, type SearchMatch } from "@marko/shared";
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";
import { basename, dirname } from "../../paths.ts";
import { t } from "../../i18n.ts";

/** 每个文件先列几行（同 Typora：列 5 行，第 6 行起收着） */
const PREVIEW_LINES = 5;
/** 前面的文件加起来不到这么多处时，这个文件直接全列（同 Typora） */
const AUTO_EXPAND_BELOW = 30;

interface ResultGroup {
  path: string;
  stem: string;
  extension: string;
  /** 所在目录相对工作区，「notes / sub / 」这样（同 Typora）；在根上是空的 */
  location: string;
  matches: SearchMatch[];
  /** 这个文件只列了前面的（W-5） */
  truncated: boolean;
  /** 前面的文件加起来有几处 */
  before: number;
}

type GroupState = "collapsed" | "expanded";

const props = defineProps<{ api: MarkoApi; root: string | null }>();
const emit = defineEmits<{ openFile: [path: string]; openMatch: [path: string, match: SearchMatch] }>();

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
/** 用户点过箭头、「再显示」的文件 */
const expanded = reactive(new Map<string, GroupState>());
/** 点过的文件或者那一行（灰底） */
const active = ref<string | null>(null);

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

/** 文件所在目录相对工作区：「notes / sub / 」（同 Typora） */
function locationOf(path: string): string {
  const root = props.root ?? "";
  const directory = dirname(path);
  if (directory.length <= root.length) return "";
  return `${directory.slice(root.length).replace(/^[\\/]+/, "").replace(/[\\/]+/g, " / ")} / `;
}

const groups = computed<ResultGroup[]>(() => {
  let before = 0;
  return results.value.map((file) => {
    const name = basename(file.path);
    const dot = name.lastIndexOf(".");
    const group = {
      path: file.path,
      stem: dot > 0 ? name.slice(0, dot) : name,
      extension: dot > 0 ? name.slice(dot) : "",
      location: locationOf(file.path),
      matches: file.matches,
      truncated: !!file.truncated,
      before,
    };
    before += file.matches.length;
    return group;
  });
});

/** 收起、全列，还是先列 5 行（没点过时前面的不到 30 处就全列） */
function state(group: ResultGroup): GroupState | "preview" {
  const chosen = expanded.get(group.path);
  if (chosen) return chosen;
  return group.before < AUTO_EXPAND_BELOW ? "expanded" : "preview";
}

/** 只多出 1 行时也直接列出来（不放「再显示 1 处」） */
function hiddenCount(group: ResultGroup): number {
  if (state(group) !== "preview" || group.matches.length <= PREVIEW_LINES + 1) return 0;
  return group.matches.length - PREVIEW_LINES;
}

function visibleMatches(group: ResultGroup): SearchMatch[] {
  return hiddenCount(group) ? group.matches.slice(0, PREVIEW_LINES) : group.matches;
}

/** 箭头：收起的展开成全列，否则收起（同 Typora） */
function toggle(group: ResultGroup): void {
  expanded.set(group.path, state(group) === "collapsed" ? "expanded" : "collapsed");
}

/**
 * 一行拆成匹配和不匹配的几段。第一个匹配前面的：去掉开头的空白，超过 20 个字只留最后 20 个字、前面加「...」（同 Typora），
 * 匹配在长行的后面也看得见
 */
function segments(match: SearchMatch): Array<{ text: string; hit: boolean }> {
  const parts: Array<{ text: string; hit: boolean }> = [];
  const text = match.preview.replace(/[\r\n]/g, "");
  let at = 0;
  for (const [from, to] of match.ranges) {
    if (from > at) parts.push({ text: text.slice(at, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  const first = parts[0];
  if (first && !first.hit && match.ranges.length) {
    let lead = first.text.replace(/^\s+/, "").replace(/\s+$/, " ");
    if (lead.length > 20) {
      const tail = lead.slice(-20);
      lead = `...${tail.replace(/^.+?\b/, "") || tail}`;
    }
    first.text = lead;
  }
  return parts;
}

function reset(): void {
  results.value = [];
  expanded.clear();
  active.value = null;
  truncated.value = false;
  error.value = null;
  cancelled.value = false;
}

// 边输入边搜：停下 300ms 再搜（见下面的 watch）
let timer: ReturnType<typeof setTimeout> | undefined;

async function run(): Promise<void> {
  // 回车、开关马上搜：等着的那次不搜了（不然同一个词 300ms 后再搜一遍，结果清掉重来，收起的文件又展开）
  clearTimeout(timer);
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
watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(() => void run(), 300);
});
watch([caseSensitive, wholeWord, regexp], () => void run());
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

function openFile(path: string): void {
  active.value = path;
  emit("openFile", path);
}

function openMatch(path: string, match: SearchMatch, index: number): void {
  active.value = `${path}\n${index}`;
  emit("openMatch", path, match);
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

const input = ref<HTMLInputElement | null>(null);

/** Ctrl+Shift+F：焦点放进搜索框，框里的字全选 */
function focus(): void {
  void nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
}

onBeforeUnmount(() => {
  clearTimeout(timer);
  offResults();
  offDone();
  if (searching.value) void props.api.search.cancel(currentId);
});

defineExpose({ focus });
</script>

<style scoped>
/* 样子同 Typora 侧栏的查找 */
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 14px;
}

.search-cancel {
  color: var(--md-link, #4183c4);
  cursor: pointer;
}

/* 搜索框：左右 16px、下面 16px；框 24px 高，右边留 64px 放三个开关 */
.search-form {
  position: relative;
  flex: none;
  padding: 0 16px 16px;
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  height: 24px;
  padding: 1px 64px 1px 4px;
  border: 1px solid var(--app-input-border, rgba(146, 146, 146, 0.56));
  border-radius: 0;
  outline: none;
  background: var(--md-background, #fff);
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.search-input:focus {
  border-color: var(--app-primary, #428bca);
}

/* 开关：半透明、没有边框，开着的和鼠标移上去的灰底 */
.search-option {
  position: absolute;
  top: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 22px;
  height: 16px;
  margin-top: 1px;
  padding: 1px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 10px;
  opacity: 0.5;
}

.search-option.active,
.search-option:hover {
  background: var(--app-active-file, #eee);
  opacity: 1;
}

.search-option svg {
  width: 16px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
}

.search-option-regex {
  right: 20px;
}

.search-option-word {
  right: 42px;
}

.search-option-case {
  right: 64px;
}

.search-status {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px 6px;
  color: var(--md-muted, #777);
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

.search-results :deep(.el-scrollbar__view) {
  padding-bottom: 32px;
}

.search-item {
  border-bottom: 1px solid var(--app-sidebar-border, #e9e9e9);
}

.search-item.active {
  background: var(--app-active-file, #eee);
}

.search-file {
  position: relative;
  display: flex;
  padding-top: 6px;
  font-size: 13.5px;
  line-height: 20px;
  cursor: pointer;
}

.search-file-caret {
  position: absolute;
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 0.5ch 0 1.5ch;
  opacity: 0.5;
  cursor: pointer;
}

.search-file-caret:hover {
  opacity: 0.8;
}

.search-file-caret svg {
  width: 8px;
  height: 8px;
  fill: currentColor;
}

.search-file-name {
  flex: 1;
  min-width: 0;
  padding-left: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-file-stem {
  font-weight: 700;
}

.search-file-count {
  flex: none;
  align-self: flex-start;
  margin-right: 6px;
  padding: 0 3.5px;
  border-radius: 2px;
  background: var(--app-search-count, #eee);
  font-size: 13px;
  line-height: 20px;
}

.search-file-location {
  width: 90%;
  min-height: 1px;
  padding-left: 24px;
  overflow: hidden;
  font-size: 12px;
  opacity: 0.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-matches {
  padding-bottom: 6px;
}

/* 一处匹配一行：13px，超出的截掉；鼠标移上去、点过的灰底 */
.search-line {
  padding: 3px 0 3px 24px;
  overflow: hidden;
  font-family: Raleway, "Source Sans Pro", sans-serif;
  font-size: 13px;
  white-space: pre;
  cursor: pointer;
}

.search-line:hover,
.search-line.active {
  background: var(--app-active-file, #eee);
}

.search-hit {
  background: var(--app-search-hit, rgba(248, 192, 116, 0.3));
  color: inherit;
}
</style>
