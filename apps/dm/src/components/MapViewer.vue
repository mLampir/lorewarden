<script setup lang="ts">
import type { Asset } from '@lorewarden/core';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ maps: Asset[] }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const dialog = ref<HTMLDialogElement>();
const index = ref(0);
const current = computed(() => props.maps[index.value]);

// A modal dialog covers the whole screen and closes with Escape.
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <dialog ref="dialog" class="viewer" :aria-label="t('live.sceneMap')" @close="emit('close')">
    <header class="row bar">
      <div class="row">
        <button
          v-for="(map, i) in props.maps"
          :key="map.id"
          class="small"
          :aria-pressed="i === index"
          @click="index = i"
        >
          {{ map.title }}
        </button>
      </div>
      <button class="small" @click="dialog?.close()">{{ t('common.close') }}</button>
    </header>
    <img v-if="current" :src="current.src" :alt="current.title" class="image" />
  </dialog>
</template>

<style scoped>
.viewer {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0.75rem;
  border: none;
  background: var(--bg);
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.viewer:not([open]) {
  display: none;
}

.bar {
  justify-content: space-between;
}

.image {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}
</style>
