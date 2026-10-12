<script setup lang="ts">
import type { ResolvedMonster } from '@lorewarden/core';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import NotesText from './NotesText.vue';
import StatBlockView from './StatBlockView.vue';

defineProps<{ monster: ResolvedMonster }>();

const { t } = useI18n();
const { term } = useSettings();
</script>

<template>
  <div class="stack monster-details">
    <p v-if="monster.attacks">
      <strong>{{ term('statBlock.attacks') }}:</strong> {{ monster.attacks }}
    </p>
    <template v-if="monster.statBlock">
      <p v-if="monster.statBlock.name !== monster.name" class="hint">
        {{ t('statBlock.basedOn', { name: monster.statBlock.name }) }}
      </p>
      <StatBlockView :stat-block="monster.statBlock" :source="monster.base?.source" />
      <NotesText v-if="monster.base?.notes" :text="monster.base.notes" />
    </template>
  </div>
</template>

<style scoped>
.monster-details {
  margin-top: 0.5rem;
}

.monster-details > p {
  margin: 0;
}
</style>
