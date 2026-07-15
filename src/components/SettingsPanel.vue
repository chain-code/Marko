<template>
  <div class="settings-mask" @mousedown.self="$emit('close')" @keydown.escape="$emit('close')">
    <section ref="settingsPanelRef" class="settings-panel" role="dialog" aria-modal="true" tabindex="-1">
      <aside class="settings-sidebar">
        <div class="settings-brand">
          <Settings2 />
          <div>
            <strong>偏好设置</strong>
            <small>Marko</small>
          </div>
        </div>
        <nav class="settings-nav" aria-label="偏好设置分类">
          <button
            v-for="item in sections"
            :key="item.key"
            type="button"
            :class="{ active: activeSection === item.key }"
            @click="activeSection = item.key"
          >
            <component :is="item.icon" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <div class="settings-main">
        <header class="settings-header">
          <div>
            <p>偏好设置</p>
            <h2>{{ activeSectionLabel }}</h2>
          </div>
          <button type="button" class="icon-button" title="关闭" @click="$emit('close')">
            <X />
          </button>
        </header>

        <div class="settings-body">
          <template v-if="activeSection === 'general'">
            <section class="settings-group">
              <h3>外观</h3>
              <label class="setting-row">
                <span><strong>主题</strong><small>选择浅色或深色编辑界面</small></span>
                <select class="field" :value="modelValue.theme" @change="updateSelect('theme', $event)">
                  <option value="solo">SoloLog</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <label class="setting-row range-row">
                <span><strong>字体大小</strong><small>{{ modelValue.fontSize }}px</small></span>
                <input type="range" min="13" max="22" :value="modelValue.fontSize" @input="update('fontSize', numberValue($event))" />
              </label>
              <label class="setting-row range-row">
                <span><strong>内容宽度</strong><small>{{ modelValue.lineWidth }}px</small></span>
                <input type="range" min="640" max="1080" step="20" :value="modelValue.lineWidth" @input="update('lineWidth', numberValue($event))" />
              </label>
            </section>

            <section class="settings-group">
              <h3>保存与恢复</h3>
              <label class="setting-row switch-row">
                <span><strong>自动保存</strong><small>按设定间隔保存已有本地文件</small></span>
                <input type="checkbox" :checked="modelValue.autoSave" @change="update('autoSave', checkedValue($event))" />
              </label>
              <label class="setting-row" :class="{ disabled: !modelValue.autoSave }">
                <span><strong>自动保存间隔</strong><small>按分钟定期写入磁盘</small></span>
                <select
                  class="field"
                  :value="modelValue.autoSaveIntervalMinutes"
                  :disabled="!modelValue.autoSave"
                  @change="update('autoSaveIntervalMinutes', numberValue($event))"
                >
                  <option :value="1">1 分钟</option>
                  <option :value="3">3 分钟</option>
                  <option :value="5">5 分钟</option>
                  <option :value="10">10 分钟</option>
                </select>
              </label>
              <label class="setting-row switch-row" :class="{ disabled: modelValue.autoSave }">
                <span><strong>切换文件时自动保存</strong><small>从侧栏或最近文件切换时保存上一个文件</small></span>
                <input
                  type="checkbox"
                  :checked="modelValue.saveOnFileSwitch"
                  :disabled="modelValue.autoSave"
                  @change="update('saveOnFileSwitch', checkedValue($event))"
                />
              </label>
              <label class="setting-row switch-row">
                <span><strong>恢复未保存的草稿</strong><small>重新启动后恢复尚未写入磁盘的内容</small></span>
                <input type="checkbox" :checked="modelValue.recoverUnsavedDrafts" @change="update('recoverUnsavedDrafts', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>保存时插入末尾换行</strong><small>确保文件以一个换行符结束</small></span>
                <input type="checkbox" :checked="modelValue.insertFinalNewline" @change="update('insertFinalNewline', checkedValue($event))" />
              </label>
              <label class="setting-row">
                <span><strong>默认换行符</strong><small>用于新文件和后续保存</small></span>
                <select class="field" :value="modelValue.defaultLineEnding" @change="updateSelect('defaultLineEnding', $event)">
                  <option value="auto">自动（跟随系统）</option>
                  <option value="lf">Unix（LF）</option>
                  <option value="crlf">Windows（CRLF）</option>
                </select>
              </label>
            </section>

            <section class="settings-group">
              <h3>侧栏与状态栏</h3>
              <label class="setting-row switch-row">
                <span><strong>显示状态栏</strong><small>在窗口底部显示文档状态</small></span>
                <input type="checkbox" :checked="modelValue.showStatusBar" @change="update('showStatusBar', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row" :class="{ disabled: !modelValue.showStatusBar }">
                <span><strong>总是显示字数</strong><small>在状态栏持续显示当前文档词数</small></span>
                <input
                  type="checkbox"
                  :checked="modelValue.alwaysShowWordCount"
                  :disabled="!modelValue.showStatusBar"
                  @change="update('alwaysShowWordCount', checkedValue($event))"
                />
              </label>
              <label class="setting-row">
                <span><strong>默认侧栏</strong><small>下次启动时首先显示的侧栏视图</small></span>
                <select class="field" :value="modelValue.defaultSidebarTab" @change="updateSelect('defaultSidebarTab', $event)">
                  <option value="files">文件</option>
                  <option value="outline">大纲</option>
                  <option value="search">搜索</option>
                </select>
              </label>
              <label class="setting-row switch-row">
                <span><strong>允许折叠大纲</strong><small>按标题层级展开或折叠大纲</small></span>
                <input type="checkbox" :checked="modelValue.collapsibleOutline" @change="update('collapsibleOutline', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>记录最近文件</strong><small>将打开过的文件加入最近文件列表</small></span>
                <input type="checkbox" :checked="modelValue.recordRecentFiles" @change="update('recordRecentFiles', checkedValue($event))" />
              </label>
              <label class="setting-row">
                <span><strong>阅读速度</strong><small>用于计算预计阅读时间</small></span>
                <select class="field" :value="modelValue.readingSpeed" @change="update('readingSpeed', numberValue($event))">
                  <option :value="120">120 词/分钟（较慢）</option>
                  <option :value="240">240 词/分钟（中等）</option>
                  <option :value="382">382 词/分钟（较快）</option>
                </select>
              </label>
            </section>
          </template>

          <template v-else-if="activeSection === 'editor'">
            <section class="settings-group">
              <h3>输入</h3>
              <label class="setting-row">
                <span><strong>缩进宽度</strong><small>Tab 和 Shift+Tab 使用的空格数</small></span>
                <select class="field" :value="modelValue.indentSize" @change="update('indentSize', numberValue($event))">
                  <option :value="2">2 个空格</option>
                  <option :value="4">4 个空格</option>
                </select>
              </label>
              <label class="setting-row switch-row">
                <span><strong>自动配对</strong><small>自动匹配括号、引号和 Markdown 符号</small></span>
                <input type="checkbox" :checked="modelValue.autoPair" @change="update('autoPair', checkedValue($event))" />
              </label>
              <label class="setting-row">
                <span><strong>Emoji 自动完成</strong><small>输入冒号和名称时显示候选项</small></span>
                <select class="field" :value="modelValue.emojiAutocomplete" @change="updateSelect('emojiAutocomplete', $event)">
                  <option value="automatic">自动触发</option>
                  <option value="escape">按 Esc 触发</option>
                  <option value="off">关闭</option>
                </select>
              </label>
              <label class="setting-row switch-row">
                <span><strong>拼写检查</strong><small>使用系统 WebView 的拼写检查能力</small></span>
                <input type="checkbox" :checked="modelValue.spellcheck" @change="update('spellcheck', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>默认复制 Markdown 源码</strong><small>执行复制时将 Markdown 作为纯文本写入剪贴板</small></span>
                <input type="checkbox" :checked="modelValue.copyMarkdownAsPlainText" @change="update('copyMarkdownAsPlainText', checkedValue($event))" />
              </label>
            </section>

            <section class="settings-group">
              <h3>编辑体验</h3>
              <label class="setting-row switch-row">
                <span><strong>打字机模式保持居中</strong><small>输入时始终将当前块保持在视口中部</small></span>
                <input type="checkbox" :checked="modelValue.typewriterCenter" @change="update('typewriterCenter', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>智能标点</strong><small>渲染智能引号、破折号和省略号</small></span>
                <input type="checkbox" :checked="modelValue.smartPunctuation" @change="update('smartPunctuation', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>保留单个换行</strong><small>将源码中的单个换行渲染为可见换行</small></span>
                <input type="checkbox" :checked="modelValue.preserveSingleLineBreaks" @change="update('preserveSingleLineBreaks', checkedValue($event))" />
              </label>
            </section>
          </template>

          <template v-else-if="activeSection === 'markdown'">
            <section class="settings-group">
              <h3>代码块</h3>
              <label class="setting-row stack-row">
                <span><strong>默认代码语言</strong><small>通过菜单插入代码块时使用，留空则不指定</small></span>
                <input class="field" :value="modelValue.defaultCodeLanguage" placeholder="例如 ts、go、python" @input="update('defaultCodeLanguage', inputValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>显示行号</strong><small>在渲染后的代码块左侧显示行号</small></span>
                <input type="checkbox" :checked="modelValue.codeLineNumbers" @change="update('codeLineNumbers', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>长代码自动换行</strong><small>代码超过内容宽度时折行显示</small></span>
                <input type="checkbox" :checked="modelValue.codeWrap" @change="update('codeWrap', checkedValue($event))" />
              </label>
            </section>

            <section class="settings-group">
              <h3>Markdown 扩展语法</h3>
              <div class="extension-list">
                <label v-for="item in extensionItems" :key="item.key" class="extension-row">
                  <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
                  <input
                    type="checkbox"
                    :checked="modelValue.extensions[item.key]"
                    @change="updateExtension(item.key, checkedValue($event))"
                  />
                </label>
              </div>
            </section>
          </template>

          <template v-else>
            <section class="settings-group">
              <h3>插入图片时</h3>
              <label class="setting-row">
                <span><strong>本地图片处理</strong><small>控制拖入或选择图片后的文件位置</small></span>
                <select class="field" :value="modelValue.imageInsertAction" @change="updateSelect('imageInsertAction', $event)">
                  <option value="none">无特殊操作</option>
                  <option value="current">复制到当前文件夹</option>
                  <option value="assets">复制到 ./assets</option>
                  <option value="documentAssets">复制到 ./${filename}.assets</option>
                </select>
              </label>
              <label class="setting-row switch-row">
                <span><strong>自动转义图片 URL</strong><small>将空格和非 ASCII 字符编码为兼容 URL</small></span>
                <input type="checkbox" :checked="modelValue.escapeImageUrls" @change="update('escapeImageUrls', checkedValue($event))" />
              </label>
              <label class="setting-row switch-row">
                <span><strong>相对路径添加 ./</strong><small>使用 ./assets/image.png 形式生成图片路径</small></span>
                <input type="checkbox" :checked="modelValue.addDotSlashToRelativeImagePath" @change="update('addDotSlashToRelativeImagePath', checkedValue($event))" />
              </label>
            </section>

            <section class="settings-group">
              <h3>图片上传</h3>
              <label class="setting-row stack-row">
                <span><strong>上传接口</strong><small>留空时按照上方本地图片规则处理</small></span>
                <input class="field" :value="modelValue.uploadUrl" placeholder="https://example.com/upload" @input="update('uploadUrl', inputValue($event))" />
              </label>
              <label class="setting-row stack-row">
                <span><strong>Token</strong><small>作为 Bearer Token 发送</small></span>
                <input class="field" :value="modelValue.uploadToken" placeholder="Bearer token" @input="update('uploadToken', inputValue($event))" />
              </label>
            </section>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { FileCode2, Image, PenLine, Settings2, SlidersHorizontal, X } from "lucide-vue-next";
import type { EditorSettings, MarkdownExtensionSettings } from "@/types";

type SettingsSection = "general" | "editor" | "markdown" | "image";
type SelectSettingKey = "theme" | "defaultLineEnding" | "defaultSidebarTab" | "emojiAutocomplete" | "imageInsertAction";

const props = defineProps<{
  modelValue: EditorSettings;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: EditorSettings];
  close: [];
}>();

const sections = [
  { key: "general", label: "通用", icon: SlidersHorizontal },
  { key: "editor", label: "编辑器", icon: PenLine },
  { key: "markdown", label: "Markdown", icon: FileCode2 },
  { key: "image", label: "图像", icon: Image },
] as const;

const extensionItems: Array<{
  key: keyof MarkdownExtensionSettings;
  label: string;
  description: string;
}> = [
  { key: "autoLinks", label: "自动识别链接", description: "识别文本中的 URL 和邮箱地址" },
  { key: "html", label: "HTML", description: "解析内联和块级 HTML" },
  { key: "toc", label: "目录", description: "支持 [TOC] 文档目录" },
  { key: "math", label: "数学公式", description: "支持行内和块级 KaTeX" },
  { key: "mermaid", label: "Mermaid", description: "渲染 Mermaid 图表" },
  { key: "flowchart", label: "Flowchart", description: "渲染 Flowchart 图表" },
  { key: "footnote", label: "脚注", description: "支持脚注定义和引用" },
  { key: "alerts", label: "GitHub 风格警报框", description: "支持 NOTE、TIP、WARNING 等块" },
  { key: "emoji", label: "Emoji", description: "将 :smile: 等短码渲染为表情" },
  { key: "marks", label: "高亮与上下标", description: "支持高亮、上标和下标" },
];

const settingsPanelRef = ref<HTMLElement | null>(null);
const activeSection = ref<SettingsSection>("general");
const activeSectionLabel = computed(() => sections.find((item) => item.key === activeSection.value)?.label ?? "通用");

onMounted(async () => {
  await nextTick();
  settingsPanelRef.value?.focus();
});

function update<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
}

function updateSelect<K extends SelectSettingKey>(key: K, event: Event) {
  update(key, (event.target as HTMLSelectElement).value as EditorSettings[K]);
}

function updateExtension(key: keyof MarkdownExtensionSettings, value: boolean) {
  emit("update:modelValue", {
    ...props.modelValue,
    extensions: {
      ...props.modelValue.extensions,
      [key]: value,
    },
  });
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function numberValue(event: Event): number {
  return Number((event.target as HTMLInputElement | HTMLSelectElement).value);
}

function checkedValue(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
</script>

<style scoped>
.settings-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(16, 20, 26, 0.46);
  padding: 1rem;
}

.settings-panel {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  width: min(880px, 100%);
  height: min(720px, calc(100vh - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.24);
}

.settings-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
  padding: 0.8rem 0.65rem;
}

.settings-brand {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 0.48rem;
  min-height: 48px;
  padding: 0 0.45rem 0.65rem;
}

.settings-brand > svg {
  width: 20px;
  height: 20px;
  color: var(--accent-strong);
}

.settings-brand div {
  display: grid;
}

.settings-brand strong {
  color: var(--text);
  font-size: 0.86rem;
}

.settings-brand small {
  color: var(--muted);
  font-size: 0.68rem;
}

.settings-nav {
  display: grid;
  align-content: start;
  gap: 0.18rem;
}

.settings-nav button {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem;
  min-height: 36px;
  border-radius: 5px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.42rem 0.56rem;
  text-align: left;
}

.settings-nav button:hover {
  background: var(--hover);
}

.settings-nav button.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-weight: 650;
}

.settings-nav svg {
  width: 16px;
  height: 16px;
}

.settings-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 70px;
  border-bottom: 1px solid var(--border);
  padding: 0.8rem 1.15rem;
}

.settings-header p {
  color: var(--muted);
  font-size: 0.7rem;
}

.settings-header h2 {
  color: var(--text);
  font-size: 1.05rem;
  font-weight: 650;
}

.settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 0.95rem 1.15rem 1.5rem;
}

.settings-group + .settings-group {
  margin-top: 1.3rem;
}

.settings-group h3 {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 650;
  margin-bottom: 0.3rem;
  text-transform: uppercase;
}

.setting-row,
.extension-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  align-items: center;
  gap: 1rem;
  min-height: 58px;
  border-bottom: 1px solid var(--border);
  padding: 0.62rem 0.15rem;
}

.setting-row > span,
.extension-row > span {
  display: grid;
  gap: 0.16rem;
  min-width: 0;
}

.setting-row strong,
.extension-row strong {
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 620;
}

.setting-row small,
.extension-row small {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.4;
}

.switch-row,
.extension-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.stack-row {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
}

.setting-row.disabled {
  opacity: 0.52;
}

.field {
  width: 100%;
}

input[type="range"] {
  width: 100%;
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-strong);
}

@media (max-width: 720px) {
  .settings-panel {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .settings-sidebar {
    grid-template-rows: auto auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.55rem;
  }

  .settings-brand {
    display: none;
  }

  .settings-nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .settings-nav button {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: 0.18rem;
    font-size: 0.7rem;
    text-align: center;
  }

  .setting-row,
  .extension-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
  }

  .switch-row,
  .extension-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>
