<script setup lang="ts">
import type { Npc } from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';

const props = defineProps<{ npc: Npc; scenes: string[] }>();
const emit = defineEmits<{ remove: [] }>();

const { t } = useI18n();

const tags = computed({
  get: () => props.npc.tags.join(', '),
  set: (value: string) => {
    props.npc.tags = value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
  },
});
</script>

<template>
  <div class="card stack">
    <div class="row">
      <label class="field grow">
        <span>{{ t('npcs.name') }}</span>
        <input
          v-model="npc.name"
          required
          @blur="fillIfBlank(npc, 'name', t('common.untitled'))"
        />
      </label>
      <label class="field grow">
        <span>{{ t('npcs.role') }}</span>
        <input v-model="npc.role" :placeholder="t('npcs.roleHint')" />
      </label>
    </div>
    <label class="field">
      <span>{{ t('npcs.description') }}</span>
      <textarea v-model="npc.description" rows="3" :placeholder="t('npcs.descriptionHint')" />
    </label>
    <label class="field">
      <span>{{ t('npcs.voice') }}</span>
      <textarea v-model="npc.voice" rows="2" :placeholder="t('npcs.voiceHint')" />
    </label>
    <label class="field">
      <span>{{ t('npcs.notes') }}</span>
      <textarea v-model="npc.notes" rows="3" :placeholder="t('npcs.notesHint')" />
    </label>
    <label class="field">
      <span>{{ t('common.tags') }}</span>
      <input v-model.lazy="tags" :placeholder="t('common.tagsHint')" />
    </label>
    <p class="hint">
      {{ scenes.length > 0 ? t('common.appearsIn', { scenes: scenes.join(', ') }) : t('common.inNoScene') }}
    </p>
    <div class="row">
      <button class="danger" type="button" @click="emit('remove')">{{ t('npcs.delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
.grow {
  flex: 1 1 12rem;
}
</style>
