<script setup lang="ts">
import {
  type Adventure,
  assessEncounter,
  type Encounter,
  type EncounterMonster,
  formatChallengeRating,
  removeEncounter,
  resolvePoolMonster,
  type Scene,
} from '@lorewarden/core';
import { PenLine, Swords, X } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import EncounterGenerator from './EncounterGenerator.vue';
import EncounterMechanics from './EncounterMechanics.vue';

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

const isIndividual = (entry: EncounterMonster) =>
  entry.name !== undefined || entry.description !== undefined || entry.hp !== undefined;

/** Monsters whose name, description and hit points are shown, by encounter and position. */
const open = reactive(
  new Set(
    props.adventure.encounters.flatMap((encounter) =>
      encounter.monsters.flatMap((entry, i) =>
        isIndividual(entry) ? [`${encounter.id}:${i}`] : [],
      ),
    ),
  ),
);

function toggle(key: string) {
  if (!open.delete(key)) open.add(key);
}

/** Sets a text of a monster; an emptied field goes back to the pool monster's. */
function setText(entry: EncounterMonster, field: 'name' | 'description', event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value) entry[field] = value;
  else delete entry[field];
}

function setHp(entry: EncounterMonster, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (value > 0) entry.hp = value;
  else delete entry.hp;
}

function addMonster(encounter: Encounter, event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value) {
    encounter.monsters.push({ poolMonsterId: select.value, count: 1 });
    open.add(`${encounter.id}:${encounter.monsters.length - 1}`);
  }
  select.value = '';
}

function removeMonster(encounter: Encounter, index: number) {
  encounter.monsters.splice(index, 1);
  open.clear();
  // Triggers watching a creature that has left the fight go back to the game master.
  const left = new Set(encounter.monsters.map((m) => m.poolMonsterId));
  for (const mechanic of encounter.mechanics) {
    if (mechanic.target && !left.has(mechanic.target)) {
      if (encounter.objects.some((o) => o.id === mechanic.target)) continue;
      mechanic.trigger = 'manual';
      delete mechanic.target;
    }
  }
}

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
        <li v-for="({ entry, resolved }, i) in monsters" :key="`${encounter.id}:${i}`">
          <div class="row monster">
            <input
              v-model.number="entry.count"
              type="number"
              min="1"
              max="30"
              :aria-label="t('generator.count')"
            />
            ×
            <span class="grow">
              {{ entry.name ?? resolved?.name ?? entry.poolMonsterId }}
              <span v-if="resolved" class="muted">
                <template v-if="entry.name">{{ resolved.name }} · </template>CR {{ formatChallengeRating(resolved.cr) }}
              </span>
            </span>
            <button
              type="button"
              class="small ghost icon-only"
              :title="t('generator.individual')"
              :aria-label="t('generator.individual')"
              :aria-expanded="open.has(`${encounter.id}:${i}`)"
              @click="toggle(`${encounter.id}:${i}`)"
            >
              <PenLine aria-hidden="true" />
            </button>
            <button
              type="button"
              class="small ghost icon-only"
              :title="t('common.remove')"
              :aria-label="t('common.remove')"
              @click="removeMonster(encounter, i)"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div v-if="open.has(`${encounter.id}:${i}`)" class="individual">
            <label class="field">
              <span>{{ t('generator.name') }}</span>
              <input
                :value="entry.name ?? ''"
                :placeholder="resolved?.name"
                @change="setText(entry, 'name', $event)"
              />
            </label>
            <label class="field">
              <span>{{ t('generator.description') }}</span>
              <input
                :value="entry.description ?? ''"
                :placeholder="t('generator.descriptionHint')"
                @change="setText(entry, 'description', $event)"
              />
            </label>
            <label class="field">
              <span>{{ t('generator.hp') }}</span>
              <input
                type="number"
                min="1"
                :value="entry.hp ?? ''"
                :placeholder="resolved?.hp?.toString()"
                @change="setHp(entry, $event)"
              />
            </label>
          </div>
        </li>
      </ul>
      <select
        v-if="adventure.monsterPool.length > 0"
        class="add-monster"
        :aria-label="t('generator.addMonster')"
        @change="addMonster(encounter, $event)"
      >
        <option value="">{{ t('generator.addMonster') }}</option>
        <option v-for="pool in adventure.monsterPool" :key="pool.id" :value="pool.id">
          {{ pool.overrides.name ?? pool.name }}
        </option>
      </select>
      <EncounterMechanics :adventure="adventure" :encounter="encounter" />
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
    <p v-else class="hint">{{ t('generator.individualHint') }}</p>
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
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
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

.monster {
  flex-wrap: nowrap;
}

.monster input {
  width: 4rem;
}

.grow {
  flex: 1;
  min-width: 0;
}

.individual {
  display: grid;
  grid-template-columns: 1fr 2fr 5rem;
  gap: 0.4rem;
  margin: 0.2rem 0 0.4rem 1rem;
}

.individual > * {
  min-width: 0;
}

.individual input {
  width: 100%;
}

@media (max-width: 480px) {
  .individual {
    grid-template-columns: 1fr;
  }
}

.add-monster {
  align-self: flex-start;
  font-size: 0.85rem;
  color: var(--muted);
}

.encounter .hint {
  margin: 0;
}

.spread {
  justify-content: space-between;
  align-items: center;
}
</style>
