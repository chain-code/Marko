<template>
  <ElDialog
    v-model="visible"
    :title="current?.title ?? ''"
    width="420px"
    :close-on-click-modal="false"
    :show-close="false"
    :append-to-body="true"
    align-center
    @close="settleWith(current?.cancelValue ?? '')"
    @closed="clear"
  >
    <p class="choice-message">{{ current?.message }}</p>
    <template #footer>
      <div class="choice-footer">
        <ElButton
          v-for="choice in current?.choices ?? []"
          :key="choice.value"
          :class="{ 'choice-left': choice.left }"
          :type="choice.primary ? 'primary' : choice.danger ? 'danger' : 'default'"
          :data-choice="choice.value"
          @click="pick(choice.value)"
        >
          {{ choice.label }}
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
// 几个按钮的确认窗口（未保存确认 F-10、保存冲突 F-6……）：ElMessageBox 只有两个按钮，这里是 ElDialog。
// Esc、右上角关闭算选了 cancelValue
import { ref, shallowRef } from "vue";

export interface Choice {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
  /** 放在左边（同 Typora 未保存确认的「保存」「放弃更改」），其余的靠右 */
  left?: boolean;
}

interface Request {
  title: string;
  message: string;
  choices: Choice[];
  cancelValue: string;
  resolve(value: string): void;
  settled: boolean;
}

const visible = ref(false);
const current = shallowRef<Request | null>(null);

/**
 * 点了按钮、按了 Esc 马上交出结果（不等关闭的动画：之后马上来的操作，如保存，要按选了的结果来）；
 * 动画结束前内容留着
 */
function settleWith(value: string): void {
  const request = current.value;
  if (!request || request.settled) return;
  request.settled = true;
  request.resolve(value);
}

function pick(value: string): void {
  settleWith(value);
  visible.value = false;
}

/** 关闭的动画结束：清掉（这期间又来了新的就留着新的） */
function clear(): void {
  if (current.value?.settled) current.value = null;
}

function choose(title: string, message: string, choices: Choice[], cancelValue: string): Promise<string> {
  return new Promise((resolve) => {
    // 前一个还没选：按取消交出
    settleWith(current.value?.cancelValue ?? "");
    current.value = { title, message, choices, cancelValue, resolve, settled: false };
    visible.value = true;
  });
}

defineExpose({ choose });
</script>

<style scoped>
.choice-message {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* 标了 left 的按钮靠左，其余靠右（同 Typora 的三个按钮的确认框） */
.choice-footer {
  display: flex;
  justify-content: flex-end;
}

.choice-footer .choice-left + :not(.choice-left) {
  margin-left: auto;
}
</style>
