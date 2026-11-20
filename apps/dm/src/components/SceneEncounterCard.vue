<script setup lang="ts">
import { type Adventure, type Encounter, encounterMonsters } from '@lorewarden/core';
import { Shield, Zap } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { triggerText } from '../lib/mechanics';
import { hasMonsterDetails, quickStats } from '../lib/monster';
import { difficultyLabel } from '../lib/review';
import MonsterDetails from './MonsterDetails.vue';
import NotesText from './NotesText.vue';
import TermText from './TermText.vue';

/**
 * An encounter of the scene in live mode: its monsters with armor class and hit points at a
 * glance and their stat blocks to fold open, its objects and mechanics, and a button that puts
 * it into the initiative.
 */
const props = defineProps<{ adventure: Adventure; encounter: Encounter }>();
const emit = defineEmits<{ add: [] }>();
const { t } = useI18n();
const { term } = useSettings();

const monsters = computed(() =>
  encounterMonsters(props.adventure, props.encounter).map(
    ({ entry, resolved, name, kind, hp }, i) => ({
      key: `${entry.poolMonsterId}-${i}`,
      count: entry.count,
      name,
      kind,
      description: entry.description,
      resolved: resolved && { ...resolved, hp },
    }),
  ),
);

const mechanics = computed(() =>
  props.encounter.mechanics.map((mechanic) => ({
    id: mechanic.id,
    when: triggerText(t, props.adventure, props.encounter, mechanic),
    text: mechanic.text,
  })),
);
</script>

<template>
  <article class="card entity">
    <ul class="list stack">
      <li v-for="monster in monsters" :key="monster.key">
        <strong v-if="!monster.resolved">{{ monster.count }}× {{ monster.name }}</strong>
        <details v-else-if="hasMonsterDetails(monster.resolved)" class="monster">
          <summary>
            <strong>{{ monster.count }}× {{ monster.name }}</strong>
            <span v-if="monster.kind" class="muted quick">({{ monster.kind }})</span>
            <span class="muted quick">{{ quickStats(term, { ac: monster.resolved.ac, hp: monster.resolved.hp }) }}</span>
            <span class="show">{{ t('statBlock.show') }}</span>
            <span v-if="monster.description" class="description">
              {{ monster.description }}
            </span>
            <NotesText v-if="monster.resolved.notes" class="muted notes" :text="monster.resolved.notes" />
          </summary>
          <MonsterDetails :monster="monster.resolved" />
        </details>
        <template v-else>
          <strong>{{ monster.count }}× {{ monster.name }}</strong>
          <span v-if="monster.kind" class="muted quick">({{ monster.kind }})</span>
          <span class="muted quick">{{ quickStats(term, { ac: monster.resolved.ac, hp: monster.resolved.hp }) }}</span>
          <span v-if="monster.description" class="description">
            {{ monster.description }}
          </span>
          <NotesText v-if="monster.resolved.notes" class="muted notes" :text="monster.resolved.notes" />
        </template>
      </li>
      <li v-for="object in encounter.objects" :key="object.id">
        <strong class="inline"><Shield aria-hidden="true" />{{ object.name }}</strong>
        <span class="muted quick">{{ quickStats(term, { ac: object.ac, hp: object.hp }) }}</span>
        <span v-if="object.description" class="description">
          {{ object.description }}
        </span>
      </li>
    </ul>
    <div v-if="mechanics.length > 0" class="secret">
      <span class="secret-label inline"><Zap aria-hidden="true" />{{ t('mechanics.heading') }}</span>
      <ul class="list mechanics">
        <li v-for="mechanic in mechanics" :key="mechanic.id">
          <strong>{{ mechanic.when }}:</strong> <TermText :text="mechanic.text" />
        </li>
      </ul>
    </div>
    <p v-if="encounter.difficulty" class="hint">
      {{ t('live.difficulty', { difficulty: difficultyLabel(t, encounter.difficulty) }) }}
    </p>
    <div class="row actions">
      <button class="small" @click="emit('add')">{{ t('live.addToInitiative') }}</button>
    </div>
  </article>
</template>

<style scoped>
.quick {
  margin-left: 0.5rem;
}

.monster summary {
  cursor: pointer;
}

.monster .show {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: var(--accent);
}

.monster[open] .show {
  display: none;
}

.monster .notes {
  display: block;
}

.entity .inline svg {
  width: 0.9rem;
  height: 0.9rem;
}

.mechanics {
  margin: 0.2rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.description {
  display: block;
  font-style: italic;
}
</style>
