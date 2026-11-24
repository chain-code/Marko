<template>
  <ElDialog v-model="open" :title="texts.table.insert" width="320px" :append-to-body="true" @closed="emit('closed')" @opened="focusFirst">
    <ElForm label-width="64px" @submit.prevent="confirm">
      <ElFormItem :label="texts.table.columns">
        <ElInputNumber ref="first" v-model="columns" :min="1" :max="64" :step="1" step-strictly @keydown.enter.prevent="confirm" />
      </ElFormItem>
      <ElFormItem :label="texts.table.rows">
        <ElInputNumber v-model="rows" :min="2" :max="1000" :step="1" step-strictly @keydown.enter.prevent="confirm" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="open = false">{{ texts.cancel }}</ElButton>
      <ElButton type="primary" @click="confirm">{{ texts.ok }}</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
// T-1：Ctrl+T 弹出的小窗口：列数、行数（含表头，默认 3 列 2 行），确定后插入；表头是「列 1」「列 2」…
import { ElButton, ElDialog, ElForm, ElFormItem, ElInputNumber } from "element-plus";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/input-number/style/css";
import { nextTick, ref } from "vue";
import { useTexts } from "../texts.ts";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [columns: number, rows: number]; closed: [] }>();

const texts = useTexts();
const columns = ref(3);
const rows = ref(2);
const first = ref<{ focus?: () => void } | null>(null);

function focusFirst(): void {
  void nextTick(() => first.value?.focus?.());
}

function confirm(): void {
  emit("confirm", columns.value, rows.value);
  open.value = false;
}
</script>
