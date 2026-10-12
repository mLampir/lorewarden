<script setup lang="ts">
import type { Adventure, Clue } from '@lorewarden/core';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';

defineProps<{ adventure: Adventure; clue: Clue }>();
const emit = defineEmits<{ remove: [] }>();

const { t } = useI18n();

function toggle(list: string[], id: string) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}
</script>

<template>
  <div class="card stack">
    <label class="field">
      <span>{{ t('clues.text') }}</span>
      <textarea
        v-model="clue.text"
        rows="2"
        required
        :placeholder="t('clues.textHint')"
        @blur="fillIfBlank(clue, 'text', t('common.untitled'))"
      />
    </label>
    <label class="field">
      <span>{{ t('clues.notes') }}</span>
      <textarea v-model="clue.notes" rows="2" :placeholder="t('clues.notesHint')" />
    </label>
    <fieldset>
      <legend>{{ t('clues.scenes') }}</legend>
      <p class="hint">{{ t('clues.scenesHint') }}</p>
      <div class="row">
        <label v-for="scene in adventure.scenes" :key="scene.id" class="chip">
          <input
            type="checkbox"
            :checked="clue.sceneIds.includes(scene.id)"
            @change="toggle(clue.sceneIds, scene.id)"
          />
          {{ scene.title }}
        </label>
      </div>
    </fieldset>
    <div class="row">
      <button class="danger" type="button" @click="emit('remove')">{{ t('clues.delete') }}</button>
    </div>
  </div>
</template>
