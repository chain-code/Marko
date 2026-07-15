<template>
  <div class="unsaved-mask" @keydown.escape.prevent="emit('cancel')">
    <section
      ref="dialogRef"
      class="unsaved-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
      aria-describedby="unsaved-description"
      tabindex="-1"
    >
      <header class="unsaved-header">
        <span class="unsaved-icon" aria-hidden="true"><FileWarning /></span>
        <div>
          <h2 id="unsaved-title">保存对“{{ fileName }}”的更改吗？</h2>
          <p id="unsaved-description">如果不保存，更改将会丢失。</p>
        </div>
      </header>

      <footer class="unsaved-actions">
        <button type="button" class="dialog-button" :disabled="busy" @click="emit('cancel')">
          取消
        </button>
        <button type="button" class="dialog-button danger" :disabled="busy" @click="emit('discard')">
          不保存
        </button>
        <button ref="saveButtonRef" type="button" class="dialog-button primary" :disabled="busy" @click="emit('save')">
          <LoaderCircle v-if="busy" class="spin" />
          <Save v-else />
          保存
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { FileWarning, LoaderCircle, Save } from "lucide-vue-next";

defineProps<{
  fileName: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  save: [];
  discard: [];
  cancel: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const saveButtonRef = ref<HTMLButtonElement | null>(null);

onMounted(async () => {
  await nextTick();
  dialogRef.value?.focus();
  saveButtonRef.value?.focus();
});
</script>

<style scoped>
.unsaved-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.34);
  padding: 1rem;
}

.unsaved-dialog {
  width: min(440px, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 20px 64px rgba(15, 23, 42, 0.22);
  color: var(--text);
}

.unsaved-dialog:focus {
  outline: none;
}

.unsaved-header {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 0.8rem;
  padding: 1.15rem 1.15rem 1rem;
}

.unsaved-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 7px;
  background: var(--warning-soft);
  color: var(--warning);
}

.unsaved-icon svg {
  width: 19px;
  height: 19px;
}

.unsaved-header h2 {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 650;
  line-height: 1.45;
}

.unsaved-header p {
  margin: 0.34rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}

.unsaved-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.48rem;
  border-top: 1px solid var(--border);
  background: var(--panel-subtle);
  padding: 0.7rem 0.8rem;
}

.dialog-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
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

.dialog-button.danger {
  color: var(--danger);
}

.dialog-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.dialog-button svg {
  width: 14px;
  height: 14px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
