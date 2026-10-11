<script setup lang="ts">
import {
  type Adventure,
  assessEncounter,
  formatChallengeRating,
  removeEncounter,
  resolvePoolMonster,
  type Scene,
} from '@lorewarden/core';
import { Swords } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import EncounterGenerator from './EncounterGenerator.vue';

const props = defineProps<{ adventure: Adventure; scene: Scene }>();

const { t } = useI18n();

const generating = ref(false);

const encounters = computed(() =>
  props.adventure.encounters
    .filter((e) => props.scene.encounterIds.includes(e.id) || e.sceneId === props.scene.id)
    .map((encounter) => ({
      encounter,
      assessment: assessEncounter(props.adventure, encounter),
      monsters: encounter.monsters.map((entry) => {
        const pool = props.adventure.monsterPool.find((p) => p.id === entry.poolMonsterId);
        return { entry, resolved: pool && resolvePoolMonster(props.adventure, pool) };
      }),
    })),
);

function remove(encounterId: string) {
  if (!window.confirm(t('generator.deleteConfirm'))) return;
  Object.assign(props.adventure, removeEncounter(props.adventure, encounterId));
}
</script>

<template>
  <fieldset class="stack">
    <legend><Swords aria-hidden="true" />{{ t('generator.heading') }}</legend>
    <article v-for="{ encounter, assessment, monsters } in encounters" :key="encounter.id" class="encounter">
      <ul>
        <li v-for="{ entry, resolved } in monsters" :key="entry.poolMonsterId">
          <input
            v-model.number="entry.count"
            type="number"
            min="1"
            max="30"
            :aria-label="t('generator.count')"
          />
          × {{ resolved?.name ?? entry.poolMonsterId }}
          <span v-if="resolved" class="muted">CR {{ formatChallengeRating(resolved.cr) }}</span>
        </li>
      </ul>
      <div class="row spread">
        <p class="hint">
          <template v-if="assessment">
            {{
              t('generator.rating', {
                xp: assessment.xp,
                difficulty: t(`review.difficulty.${assessment.rating}`),
              })
            }}
          </template>
          <template v-if="encounter.difficulty">
            · {{ t('live.difficulty', { difficulty: encounter.difficulty }) }}
          </template>
        </p>
        <button type="button" class="small" @click="remove(encounter.id)">
          {{ t('common.remove') }}
        </button>
      </div>
    </article>
    <p v-if="encounters.length === 0" class="hint">{{ t('generator.none') }}</p>
    <EncounterGenerator
      v-if="generating"
      :adventure="adventure"
      :scene-id="scene.id"
      @added="generating = false"
    />
    <div v-else class="row">
      <button type="button" @click="generating = true">{{ t('generator.open') }}</button>
    </div>
  </fieldset>
</template>

<style scoped>
.encounter {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.encounter ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.encounter input {
  width: 4rem;
}

.encounter .hint {
  margin: 0.3rem 0 0;
}

.spread {
  justify-content: space-between;
  align-items: center;
}
</style>
