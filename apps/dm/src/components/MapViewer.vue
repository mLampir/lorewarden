<script setup lang="ts">
import type { Asset, BattleMap } from '@lorewarden/core';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BattleMapView from './BattleMapView.vue';

const props = defineProps<{ battleMap?: BattleMap; images: Asset[] }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const dialog = ref<HTMLDialogElement>();

type Tab = { key: string; title: string; image?: Asset };
const tabs = computed<Tab[]>(() => [
  ...(props.battleMap ? [{ key: 'battle-map', title: t('battleMap.title') }] : []),
  ...props.images.map((image) => ({ key: image.id, title: image.title, image })),
]);
const active = ref(0);
const current = computed(() => tabs.value[active.value]);

// A modal dialog covers the whole screen and closes with Escape.
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <dialog ref="dialog" class="viewer" :aria-label="t('live.sceneMap')" @close="emit('close')">
    <header class="row bar">
      <div class="row">
        <template v-if="tabs.length > 1">
          <button
            v-for="(tab, i) in tabs"
            :key="tab.key"
            class="small"
            :aria-pressed="i === active"
            @click="active = i"
          >
            {{ tab.title }}
          </button>
        </template>
        <strong v-else>{{ current?.title }}</strong>
      </div>
      <button class="small" @click="dialog?.close()">{{ t('common.close') }}</button>
    </header>
    <img v-if="current?.image" :src="current.image.src" :alt="current.title" class="content" />
    <BattleMapView v-else-if="battleMap" :map="battleMap" class="content" />
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

.content {
  flex: 1;
  min-height: 0;
  width: 100%;
}

img.content {
  object-fit: contain;
}
</style>
