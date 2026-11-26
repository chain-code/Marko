<template>
  <ElDialog
    v-model="open"
    class="marko-table-size"
    :title="texts.table.insert"
    width="420px"
    top="46px"
    :show-close="false"
    :append-to-body="true"
    @closed="emit('closed')"
    @opened="focusFirst"
  >
    <form class="marko-table-size-fields" @submit.prevent="confirm">
      <label>
        <span>{{ texts.table.columns }}</span>
        <ElInputNumber ref="first" v-model="columns" :min="1" :max="64" :step="1" step-strictly :controls="false" @keydown.enter.prevent="confirm" />
      </label>
      <label>
        <span>{{ texts.table.rows }}</span>
        <ElInputNumber v-model="rows" :min="2" :max="1000" :step="1" step-strictly :controls="false" @keydown.enter.prevent="confirm" />
      </label>
    </form>
    <template #footer>
      <ElButton @click="open = false">{{ texts.cancel }}</ElButton>
      <ElButton type="primary" @click="confirm">{{ texts.ok }}</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
// T-1：Ctrl+T 弹出的小窗口：列数、行数（含表头，默认 3 列 4 行，同 Typora），确定后插入；表头是「列 1」「列 2」…
// 样子同 Typora：420 宽、贴着窗口上边、没有右上角的关闭，一排「列」「行」两个输入框（没有加减按钮，↑ ↓ 照样加减）
import { ElButton, ElDialog, ElInputNumber } from "element-plus";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/input-number/style/css";
import { nextTick, ref } from "vue";
import { useTexts } from "../texts.ts";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [columns: number, rows: number]; closed: [] }>();

const texts = useTexts();
const columns = ref(3);
const rows = ref(4);
const first = ref<{ focus?: () => void } | null>(null);

function focusFirst(): void {
  void nextTick(() => first.value?.focus?.());
}

function confirm(): void {
  emit("confirm", columns.value, rows.value);
  open.value = false;
}
</script>

<style>
/* 同 Typora：标签在输入框左边，两组各占一半，中间空 20px */
.marko-table-size-fields {
  display: flex;
  gap: 20px;
}

.marko-table-size-fields label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
}

.marko-table-size-fields .el-input-number {
  flex: 1;
  width: auto;
}

.marko-table-size-fields .el-input-number .el-input__inner {
  text-align: left;
}
</style>
