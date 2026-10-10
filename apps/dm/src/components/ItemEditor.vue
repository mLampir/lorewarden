<script setup lang="ts">
import type { Item } from '@lorewarden/core';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';

defineProps<{ item: Item; scenes: string[] }>();
const emit = defineEmits<{ remove: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="card stack">
    <div class="row">
      <label class="field grow">
        <span>{{ t('items.name') }}</span>
        <input
          v-model="item.name"
          required
          @blur="fillIfBlank(item, 'name', t('common.untitled'))"
        />
      </label>
      <label class="field grow">
        <span>{{ t('items.rarity') }}</span>
        <input v-model="item.rarity" :placeholder="t('items.rarityHint')" />
      </label>
    </div>
    <label class="field">
      <span>{{ t('items.description') }}</span>
      <textarea v-model="item.description" rows="3" :placeholder="t('items.descriptionHint')" />
    </label>
    <label class="field">
      <span>{{ t('items.notes') }}</span>
      <textarea v-model="item.notes" rows="3" :placeholder="t('items.notesHint')" />
    </label>
    <p class="hint">
      {{ scenes.length > 0 ? t('common.appearsIn', { scenes: scenes.join(', ') }) : t('common.inNoScene') }}
    </p>
    <div class="row">
      <button class="danger" type="button" @click="emit('remove')">{{ t('items.delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
.grow {
  flex: 1 1 12rem;
}
</style>
