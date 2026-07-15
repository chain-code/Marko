<template>
  <div class="dialog-mask" @keydown.escape.prevent="emit('cancel')">
    <form ref="dialogRef" class="text-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" @submit.prevent="submit">
      <header>
        <PencilLine />
        <h2 :id="titleId">{{ title }}</h2>
      </header>
      <label>
        <span>{{ message }}</span>
        <input ref="inputRef" v-model="value" :placeholder="placeholder" @keydown.enter.stop />
      </label>
      <footer>
        <button type="button" class="dialog-button" @click="emit('cancel')">取消</button>
        <button type="submit" class="dialog-button primary" :disabled="!value.trim()">{{ confirmLabel }}</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { PencilLine } from "lucide-vue-next";

const props = withDefaults(defineProps<{
  title: string;
  message: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}>(), {
  initialValue: "",
  placeholder: "",
  confirmLabel: "确定",
});

const emit = defineEmits<{
  confirm: [value: string];
  cancel: [];
}>();

const titleId = `text-dialog-${Math.random().toString(36).slice(2)}`;
const dialogRef = ref<HTMLFormElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const value = ref(props.initialValue);

onMounted(async () => {
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
});

function submit() {
  const normalized = value.value.trim();
  if (normalized) emit("confirm", normalized);
}
</script>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 105;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.34);
  padding: 1rem;
}

.text-dialog {
  width: min(420px, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 20px 64px rgba(15, 23, 42, 0.22);
  color: var(--text);
}

.text-dialog header {
  display: flex;
  align-items: center;
  gap: 0.58rem;
  border-bottom: 1px solid var(--border);
  padding: 0.82rem 0.9rem;
}

.text-dialog header svg {
  width: 17px;
  height: 17px;
  color: var(--muted);
}

.text-dialog h2 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 650;
}

.text-dialog label {
  display: grid;
  gap: 0.46rem;
  padding: 1rem;
}

.text-dialog label span {
  color: var(--muted);
  font-size: 0.76rem;
}

.text-dialog input {
  width: 100%;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  padding: 0 0.58rem;
}

.text-dialog input:focus {
  border-color: var(--accent-strong);
  outline: 0;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.text-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.48rem;
  border-top: 1px solid var(--border);
  background: var(--panel-subtle);
  padding: 0.68rem 0.78rem;
}

.dialog-button {
  min-width: 76px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0 0.72rem;
}

.dialog-button:hover:not(:disabled) {
  background: var(--hover);
}

.dialog-button.primary {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
  color: #ffffff;
}

.dialog-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
</style>
