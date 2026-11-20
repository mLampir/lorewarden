<script setup lang="ts">
import {
  type Adventure,
  buildAdaptPrompt,
  copyAdventure,
  followParty,
  parseAdaptedAdventure,
  partyOf,
} from '@lorewarden/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useParties } from '../composables/useParties';
import { saveAdventure } from '../storage/database';
import AiExchange from './AiExchange.vue';
import AiHandoff from './AiHandoff.vue';

/**
 * Fits the adventure to one of the game master's parties: size, levels and characters come from
 * the party, so nothing has to be typed in here.
 */
const props = defineProps<{ adventure: Adventure }>();
const emit = defineEmits<{ replace: [adventure: Adventure] }>();

const { t } = useI18n();
const router = useRouter();
const { monsters: ownMonsters } = useMonsterLibrary();
const { parties } = useParties();

const partyId = ref('');
const chosen = computed(() => parties.value.find((p) => p.id === partyId.value));
// The party the adventure is played with, else the first one, also once the parties have loaded.
watch(
  [parties, () => props.adventure.party.partyId],
  () => {
    if (chosen.value) return;
    partyId.value = (partyOf(props.adventure, parties.value) ?? parties.value[0])?.id ?? '';
  },
  { immediate: true },
);
const isLinked = computed(() => props.adventure.party.partyId === partyId.value);

const duplicateFailed = ref(false);

/** Keeps the original as it is and opens a copy played with the chosen party. */
async function duplicate() {
  const party = chosen.value;
  if (!party) return;
  const title = t('adapt.copyTitle', { title: props.adventure.title, party: party.name });
  const copy = followParty(copyAdventure(props.adventure, title), party);
  try {
    await saveAdventure(copy);
  } catch {
    duplicateFailed.value = true;
    return;
  }
  duplicateFailed.value = false;
  await router.push({ name: 'edit', params: { id: copy.id } });
}

/** The instructions for the AI, with the adventure fitted to the chosen party's numbers. */
function buildPrompt(): string {
  const party = chosen.value;
  const adventure = party ? followParty(props.adventure, party) : props.adventure;
  return buildAdaptPrompt(adventure, new Date(), ownMonsters.value, party);
}

function parse(json: string) {
  const result = parseAdaptedAdventure(props.adventure, json, ownMonsters.value);
  return result.ok ? { ok: true as const, value: result.adventure } : result;
}

/** Takes the adapted adventure, which from now on is played with the chosen party. */
function take(adapted: Adventure) {
  const party = chosen.value;
  if (!party) return false;
  if (!window.confirm(t('adapt.replaceConfirm', { title: props.adventure.title }))) return false;
  emit('replace', followParty(adapted, party));
  return undefined;
}
</script>

<template>
  <div class="card stack">
    <h2>{{ t('adapt.heading') }}</h2>
    <template v-if="parties.length > 0">
      <p class="hint">{{ t('adapt.intro') }}</p>
      <div class="row end">
        <label class="field">
          <span>{{ t('adventure.party') }}</span>
          <select v-model="partyId">
            <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <button type="button" :disabled="!chosen" @click="duplicate">
          {{ t('adapt.duplicate') }}
        </button>
      </div>
      <p v-if="duplicateFailed" class="error" role="alert">{{ t('adapt.duplicateFailed') }}</p>
      <p v-if="chosen && !isLinked" class="hint">{{ t('adapt.linkOnImport', { name: chosen.name }) }}</p>

      <h3>{{ t('adapt.aiHeading') }}</h3>
      <p class="hint">{{ t('adapt.aiIntro', { name: chosen?.name ?? '' }) }}</p>
      <AiHandoff
        :task="{ task: 'adapt_adventure', adventure: adventure.id, party: chosen?.id }"
        :request="t('ai.tasks.adaptAdventure', { title: adventure.title, party: chosen?.name ?? '' })"
        :disabled="!chosen"
      >
        <AiExchange
          :build-prompt="buildPrompt"
          :parse="parse"
          :take="take"
          :import-label="t('adapt.importAnswer')"
          :disabled="!chosen"
        />
      </AiHandoff>
    </template>
    <p v-else class="hint">
      {{ t('adapt.noParty') }}
      <RouterLink :to="{ name: 'party' }">{{ t('adapt.createParty') }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.end {
  align-items: flex-end;
}

h3 {
  margin: 0.5rem 0 0;
}
</style>
