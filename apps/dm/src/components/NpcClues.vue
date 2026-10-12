<script setup lang="ts">
import type { ClueWithLeads } from '@lorewarden/core';
import { Search } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import ClueCheck from './ClueCheck.vue';

/** What an NPC can give away, on their card in live mode, to tick off as it comes out. */
defineProps<{ clues: ClueWithLeads[]; foundClueIds: string[] }>();
const emit = defineEmits<{ toggle: [clueId: string] }>();
const { t } = useI18n();
</script>

<template>
  <div class="stack npc-clues">
    <span class="npc-clues-label inline">
      <Search aria-hidden="true" />{{ t('live.canGiveAway') }}
    </span>
    <ClueCheck
      v-for="{ clue, leads } in clues"
      :key="clue.id"
      :clue="clue"
      :leads="leads"
      :found="foundClueIds.includes(clue.id)"
      @toggle="emit('toggle', clue.id)"
    />
  </div>
</template>

<style scoped>
.npc-clues {
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.npc-clues-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.npc-clues-label svg {
  width: 0.9rem;
  height: 0.9rem;
  color: var(--accent);
}
</style>
