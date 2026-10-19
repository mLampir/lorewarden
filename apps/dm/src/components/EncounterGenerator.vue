<script setup lang="ts">
import {
  type Adventure,
  addGeneratedEncounter,
  creatureTypes,
  ENCOUNTER_DIFFICULTIES,
  type EncounterDifficulty,
  encounterBudget,
  experiencePoints,
  formatChallengeRating,
  type GeneratedEncounter,
  generateEncounter,
  monsterStatBlock,
  type StatBlock,
  srdMonsters,
} from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useSettings } from '../composables/useSettings';

const props = defineProps<{ adventure: Adventure; sceneId: string }>();
const emit = defineEmits<{ added: [encounterId: string] }>();

const { t } = useI18n();
const { term } = useSettings();
const library = useMonsterLibrary();

type Source = 'all' | 'own' | 'srd';

const difficulty = ref<EncounterDifficulty>('moderate');
const type = ref('');
const source = ref<Source>('all');
const proposal = ref<GeneratedEncounter>();
const nothingFits = ref(false);

/** The adventure's own monsters, then the library's, then the SRD; each id once. */
const ownMonsters = computed(() => {
  const ids = new Set(props.adventure.monsters.map((m) => m.id));
  return [...props.adventure.monsters, ...library.monsters.value.filter((m) => !ids.has(m.id))].map(
    monsterStatBlock,
  );
});
const allMonsters = computed<StatBlock[]>(() => [...ownMonsters.value, ...srdMonsters]);
const types = computed(() => creatureTypes(allMonsters.value));

const candidates = computed(() => {
  const list =
    source.value === 'own'
      ? ownMonsters.value
      : source.value === 'srd'
        ? [...srdMonsters]
        : allMonsters.value;
  return type.value === '' ? list : list.filter((m) => m.type.toLowerCase().startsWith(type.value));
});

const budget = computed(() => encounterBudget(props.adventure.party));

function generate() {
  proposal.value = generateEncounter({
    party: props.adventure.party,
    difficulty: difficulty.value,
    candidates: candidates.value,
  });
  nothingFits.value = proposal.value === undefined;
}

function add() {
  if (!proposal.value) return;
  const { adventure, encounterId } = addGeneratedEncounter(
    props.adventure,
    props.sceneId,
    proposal.value,
    difficulty.value,
    library.monsters.value,
  );
  Object.assign(props.adventure, adventure);
  proposal.value = undefined;
  emit('added', encounterId);
}
</script>

<template>
  <div class="stack generator">
    <div class="row end">
      <label class="field">
        <span>{{ t('generator.difficulty') }}</span>
        <select v-model="difficulty">
          <option v-for="d in ENCOUNTER_DIFFICULTIES" :key="d" :value="d">
            {{ t(`generator.difficulties.${d}`, { xp: budget[d] }) }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('generator.type') }}</span>
        <select v-model="type">
          <option value="">{{ t('generator.anyType') }}</option>
          <option v-for="name in types" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('generator.source') }}</span>
        <select v-model="source">
          <option value="all">{{ t('generator.sources.all') }}</option>
          <option value="own">{{ t('generator.sources.own') }}</option>
          <option value="srd">{{ t('generator.sources.srd') }}</option>
        </select>
      </label>
      <button type="button" @click="generate">
        {{ proposal ? t('generator.again') : t('generator.generate') }}
      </button>
    </div>
    <p v-if="nothingFits" class="hint" role="status">{{ t('generator.nothingFits') }}</p>
    <div v-if="proposal" class="proposal stack" role="status">
      <ul>
        <li v-for="{ statBlock, count } in proposal.monsters" :key="statBlock.id">
          <strong>{{ count }}× {{ statBlock.name }}</strong>
          <span class="muted">
            {{ term('statBlock.cr') }} {{ formatChallengeRating(statBlock.cr) }},
            {{ experiencePoints(statBlock.cr) }} {{ term('statBlock.xp') }}
          </span>
        </li>
      </ul>
      <p class="hint">
        {{
          t('generator.total', {
            xp: proposal.xp,
            difficulty: t(`review.difficulty.${proposal.rating}`),
          })
        }}
      </p>
      <div class="row">
        <button type="button" class="primary" @click="add">{{ t('generator.add') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.end {
  align-items: flex-end;
}

.proposal {
  padding: 0.6rem 0.8rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.proposal ul {
  margin: 0;
  padding-left: 1.2rem;
}

.proposal .muted {
  margin-left: 0.4rem;
}
</style>
