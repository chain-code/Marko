<template>
  <div class="dialog-mask" @keydown.escape.prevent="emit('cancel')">
    <section ref="dialogRef" class="confirm-dialog" role="alertdialog" aria-modal="true" tabindex="-1">
      <header>
        <span class="danger-icon"><Trash2 /></span>
        <div>
          <h2>{{ title }}</h2>
          <p>{{ message }}</p>
        </div>
      </header>
      <footer>
        <button ref="cancelButtonRef" type="button" class="dialog-button" @click="emit('cancel')">取消</button>
        <button type="button" class="dialog-button danger" @click="emit('confirm')">{{ confirmLabel }}</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { Trash2 } from "lucide-vue-next";

withDefaults(defineProps<{
  title: string;
  message: string;
  confirmLabel?: string;
}>(), {
  confirmLabel: "确定",
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const cancelButtonRef = ref<HTMLButtonElement | null>(null);

onMounted(async () => {
  await nextTick();
  dialogRef.value?.focus();
  cancelButtonRef.value?.focus();
});
</script>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 106;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.34);
  padding: 1rem;
}

.confirm-dialog {
  width: min(430px, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 20px 64px rgba(15, 23, 42, 0.22);
  color: var(--text);
}

.confirm-dialog:focus {
  outline: 0;
}

.confirm-dialog header {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 0.8rem;
  padding: 1.1rem;
}

.danger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 7px;
  background: var(--danger-soft);
  color: var(--danger);
}

.danger-icon svg {
  width: 18px;
  height: 18px;
}

.confirm-dialog h2 {
  margin: 0;
  font-size: 0.94rem;
  font-weight: 650;
}

.confirm-dialog p {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.5;
}

.confirm-dialog footer {
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

.dialog-button:hover {
  background: var(--hover);
}

.dialog-button.danger {
  border-color: var(--danger);
  background: var(--danger);
  color: #ffffff;
}
</style>
