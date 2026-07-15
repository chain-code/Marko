<template>
  <div class="about-mask" @keydown.escape.prevent="emit('close')">
    <section
      ref="dialogRef"
      class="about-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      aria-describedby="about-description"
      tabindex="-1"
    >
      <header>
        <span class="app-mark" aria-hidden="true">M</span>
        <div>
          <h2 id="about-title">Marko</h2>
          <p>版本 0.1.0</p>
        </div>
      </header>
      <p id="about-description" class="description">
        一个专注于连续写作体验的 Markdown 桌面编辑器。
      </p>
      <footer>
        <button ref="closeButtonRef" type="button" @click="emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);

onMounted(async () => {
  await nextTick();
  dialogRef.value?.focus();
  closeButtonRef.value?.focus();
});
</script>

<style scoped>
.about-mask {
  position: fixed;
  inset: 0;
  z-index: 108;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.34);
  padding: 1rem;
}

.about-dialog {
  width: min(390px, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 20px 64px rgba(15, 23, 42, 0.22);
  color: var(--text);
}

.about-dialog:focus {
  outline: 0;
}

.about-dialog header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1.1rem 1.1rem 0.72rem;
}

.app-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--accent-strong);
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 1rem;
  font-weight: 750;
}

.about-dialog h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 680;
}

.about-dialog header p,
.description {
  color: var(--muted);
  font-size: 0.78rem;
}

.about-dialog header p {
  margin: 0.2rem 0 0;
}

.description {
  margin: 0;
  line-height: 1.6;
  padding: 0 1.1rem 1.1rem;
}

.about-dialog footer {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
  background: var(--panel-subtle);
  padding: 0.68rem 0.78rem;
}

.about-dialog button {
  min-width: 76px;
  height: 32px;
  border: 1px solid var(--accent-strong);
  border-radius: 6px;
  background: var(--accent-strong);
  color: #ffffff;
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0 0.72rem;
}
</style>
