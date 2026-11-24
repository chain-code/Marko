<template>
  <ElDialog :model-value="visible" class="marko-about" width="380px" align-center @update:model-value="(value: boolean) => emit('update:visible', value)">
    <div class="about" data-testid="about">
      <h2 class="about-name">Marko</h2>
      <p class="about-version">{{ t("app.version", { version }) }}</p>
      <p>{{ t("app.license") }}</p>
      <ElButton link type="primary" @click="emit('openHomepage', HOMEPAGE)">{{ HOMEPAGE }}</ElButton>
    </div>
  </ElDialog>
</template>

<script setup lang="ts">
// 关于（R-5）：版本、许可证、项目地址（点了在系统浏览器里打开）
import { ref, watch } from "vue";
import { t } from "../i18n.ts";

const HOMEPAGE = "https://github.com/chain-code/Marko";

const props = defineProps<{ visible: boolean; loadVersion: () => Promise<string> }>();
const emit = defineEmits<{ "update:visible": [visible: boolean]; openHomepage: [url: string] }>();

const version = ref("");

watch(
  () => props.visible,
  async (visible) => {
    if (visible && !version.value) version.value = await props.loadVersion();
  },
  { immediate: true },
);
</script>

<style>
.marko-about .about {
  text-align: center;
}

.marko-about .about-name {
  margin: 0 0 8px;
  font-size: 24px;
}

.marko-about .about-version {
  color: var(--el-text-color-secondary);
}
</style>
