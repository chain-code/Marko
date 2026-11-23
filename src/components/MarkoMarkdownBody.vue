<template>
  <section
    class="marko-markdown-body editor-scroll"
    :data-theme="resolvedSettings.theme"
  >
    <ContinuousMarkdownEditor
      ref="editorRef"
      class="marko-editor-surface"
      :model-value="modelValue"
      :file-path="filePath || undefined"
      :outline="outline"
      :settings="resolvedSettings"
      :readonly="readOnly"
      @update:model-value="emit('update:modelValue', $event)"
      @save="emit('save')"
      @save-as="emit('saveAs')"
      @open="emit('open')"
      @image-data="emit('imageData', $event)"
      @open-link="emit('openLink', $event)"
      @open-link-href="emit('openAnchor', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { defaultEditorSettings } from "../utils/editorSettings";
import { createOutline } from "../utils/markdown";
import type {
  EditorSettings,
  ImageInsertRequest,
  MarkoMarkdownBodyHandle,
  OutlineItem,
} from "../types";

const props = withDefaults(defineProps<{
  modelValue: string;
  readOnly?: boolean;
  filePath?: string;
  settings?: Partial<EditorSettings>;
}>(), {
  readOnly: true,
  filePath: "",
  settings: () => ({}),
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
  saveAs: [];
  open: [];
  imageData: [payload: ImageInsertRequest];
  openLink: [path: string];
  openAnchor: [href: string];
  outlineChange: [outline: OutlineItem[]];
}>();

const editorRef = ref<Partial<MarkoMarkdownBodyHandle> | null>(null);
const outline = shallowRef<OutlineItem[]>(createOutline(props.modelValue));
let outlineSignature = getOutlineSignature(outline.value);
let outlineTimer = 0;

const ContinuousMarkdownEditor = defineAsyncComponent({
  loader: () => import("./ContinuousMarkdownEditor.vue"),
  loadingComponent: defineComponent({
    name: "MarkoMarkdownLoading",
    setup: () => () => h("div", {
      class: "marko-markdown-loading",
      "aria-hidden": "true",
    }),
  }),
  delay: 0,
  suspensible: false,
});

const resolvedSettings = computed<EditorSettings>(() => ({
  ...defaultEditorSettings,
  ...props.settings,
  smartQuotes: props.settings.smartQuotes
    ?? props.settings.smartPunctuation
    ?? defaultEditorSettings.smartQuotes,
  smartDashes: props.settings.smartDashes
    ?? props.settings.smartPunctuation
    ?? defaultEditorSettings.smartDashes,
  extensions: {
    ...defaultEditorSettings.extensions,
    ...props.settings.extensions,
    marks: false,
    highlight: props.settings.extensions?.highlight
      ?? props.settings.extensions?.marks
      ?? defaultEditorSettings.extensions.highlight,
    superscript: props.settings.extensions?.superscript
      ?? props.settings.extensions?.marks
      ?? defaultEditorSettings.extensions.superscript,
    subscript: props.settings.extensions?.subscript
      ?? props.settings.extensions?.marks
      ?? defaultEditorSettings.extensions.subscript,
  },
}));

onMounted(() => {
  emit("outlineChange", outline.value);
});

onBeforeUnmount(() => {
  window.clearTimeout(outlineTimer);
});

watch(
  () => props.modelValue,
  (value) => {
    scheduleOutlineUpdate(value);
  },
);

watch(editorRef, (editor) => {
  if (editor) void nextTick(() => refreshEditorLayout(editor));
});

watch(
  () => props.readOnly,
  (readOnly) => {
    if (readOnly) {
      updateOutline(props.modelValue);
    }
    void nextTick(() => refreshEditorLayout());
  },
);

function scheduleOutlineUpdate(value: string) {
  window.clearTimeout(outlineTimer);
  if (props.readOnly) {
    updateOutline(value);
    return;
  }
  outlineTimer = window.setTimeout(() => updateOutline(value), 160);
}

function updateOutline(value: string) {
  window.clearTimeout(outlineTimer);
  outlineTimer = 0;
  const nextOutline = createOutline(value);
  const nextSignature = getOutlineSignature(nextOutline);
  if (nextSignature === outlineSignature) return;
  outlineSignature = nextSignature;
  outline.value = nextOutline;
  emit("outlineChange", nextOutline);
}

function getOutlineSignature(items: OutlineItem[]) {
  return items
    .map((item) => `${item.level}:${item.line}:${item.id}:${item.title}`)
    .join("\n");
}

function refreshEditorLayout(editor = editorRef.value) {
  if (typeof editor?.refreshLayout === "function") editor.refreshLayout();
}

defineExpose<MarkoMarkdownBodyHandle>({
  replaceImagePlaceholder(placeholder, source, alt) {
    return editorRef.value?.replaceImagePlaceholder?.(placeholder, source, alt) ?? false;
  },
  focus() {
    editorRef.value?.focus?.();
  },
  refreshLayout() {
    refreshEditorLayout();
  },
});
</script>

<style scoped>
.marko-markdown-body {
  box-sizing: border-box;
  color-scheme: light;
  --panel: #ffffff;
  --panel-subtle: #f3f4f6;
  --hover: #e8ebef;
  --border: #d9dde3;
  --heading-rule: #e8ebef;
  --border-strong: #b9c0ca;
  --text: #24272d;
  --text-main: #353a42;
  --muted: #6d737c;
  --muted-soft: #8b929c;
  --accent: #3b82f6;
  --accent-strong: #2563eb;
  --accent-soft: #eaf2ff;
  --danger: #dc2626;
  --danger-soft: #fff1f2;
  --warning: #ca8a04;
  --warning-soft: #fff7ed;
  --success: #15803d;
  --success-soft: #ecfdf5;
  --shadow: 0 16px 40px rgba(31, 41, 55, 0.08);
  --reading-max-width: 860px;
  --editor-font-size: 16px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--panel);
  color: var(--text);
  overflow: auto;
  font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, "Segoe UI Emoji", "SF Pro", sans-serif;
  font-size: var(--editor-font-size);
  line-height: 1.6;
  letter-spacing: 0;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.marko-markdown-body *,
.marko-markdown-body *::before,
.marko-markdown-body *::after {
  box-sizing: border-box;
}

.marko-markdown-body[data-theme="dark"] {
  color-scheme: dark;
  --panel: #171a1f;
  --panel-subtle: #1d2127;
  --hover: #242a32;
  --border: #2b3038;
  --heading-rule: #242930;
  --border-strong: #424954;
  --text: #e7e9ee;
  --text-main: #d9dde5;
  --muted: #9aa1ad;
  --muted-soft: #7f8793;
  --accent: #6aa6ff;
  --accent-strong: #8ab8ff;
  --accent-soft: rgba(106, 166, 255, 0.14);
  --danger: #fb7185;
  --danger-soft: rgba(251, 113, 133, 0.12);
  --warning: #facc15;
  --warning-soft: rgba(250, 204, 21, 0.12);
  --success: #4ade80;
  --success-soft: rgba(74, 222, 128, 0.12);
  --shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
}

.marko-editor-surface {
  width: 100%;
  min-width: 0;
}

.marko-markdown-loading {
  width: 100%;
  min-height: 8rem;
}
</style>
