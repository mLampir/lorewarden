<script setup lang="ts">
import {
  type Adventure,
  buildAdaptPrompt,
  copyAdventure,
  followParty,
  type IntegrityProblem,
  parseAdaptedAdventure,
  partyOf,
} from '@lorewarden/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useParties } from '../composables/useParties';
import { extractJson } from '../lib/extract-json';
import { saveAdventure } from '../storage/database';

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

const prompt = ref('');
const copied = ref(false);
const answer = ref('');
const problems = ref<IntegrityProblem[]>([]);

/** Keeps the original as it is and opens a copy played with the chosen party. */
async function duplicate() {
  const party = chosen.value;
  if (!party) return;
  const title = t('adapt.copyTitle', { title: props.adventure.title, party: party.name });
  const copy = followParty(copyAdventure(props.adventure, title), party);
  await saveAdventure(copy);
  await router.push({ name: 'edit', params: { id: copy.id } });
}

/** Copies instructions for the AI; shows them for manual copying if the clipboard is blocked. */
async function copyPrompt() {
  const party = chosen.value;
  if (!party) return;
  prompt.value = buildAdaptPrompt(
    followParty(props.adventure, party),
    new Date(),
    ownMonsters.value,
    party,
  );
  try {
    await navigator.clipboard.writeText(prompt.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

/** Takes the adapted adventure, which from now on is played with the chosen party. */
function importAnswer() {
  const party = chosen.value;
  if (!party) return;
  const result = parseAdaptedAdventure(
    props.adventure,
    extractJson(answer.value),
    ownMonsters.value,
  );
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  if (!window.confirm(t('adapt.replaceConfirm', { title: props.adventure.title }))) return;
  problems.value = [];
  answer.value = '';
  emit('replace', followParty(result.adventure, party));
}

/** Copies the import errors so they can be pasted back to the AI for a fixed file. */
async function copyProblems() {
  const lines = problems.value.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
  } catch {
    // Nothing to do: the errors stay visible for manual copying.
  }
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
      <p v-if="chosen && !isLinked" class="hint">{{ t('adapt.linkOnImport', { name: chosen.name }) }}</p>

<h3>{{ t('adapt.aiHeading') }}</h3>
    <p class="hint">{{ t('adapt.aiIntro', { name: chosen?.name ?? '' }) }}</p>
    <div class="row">
      <button :disabled="!chosen" @click="copyPrompt">{{ t('claude.copyPrompt') }}</button>
    </div>
    <p v-if="copied" class="hint" role="status">{{ t('claude.copied') }}</p>
    <label v-else-if="prompt" class="field">
      <span>{{ t('claude.copyManually') }}</span>
      <textarea
        :value="prompt"
        rows="6"
        readonly
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
    </label>
    <label class="field">
      <span>{{ t('claude.answer') }}</span>
      <textarea v-model="answer" rows="4" :placeholder="t('claude.answerHint')" />
    </label>
    <div class="row">
      <button :disabled="answer.trim() === ''" @click="importAnswer">
        {{ t('adapt.importAnswer') }}
      </button>
    </div>
    <div v-if="problems.length > 0" class="error stack" role="alert">
      <p>{{ t('claude.importFailed') }}</p>
      <ul>
        <li v-for="(problem, i) in problems.slice(0, 10)" :key="i">
          <code v-if="problem.path">{{ problem.path }}</code> {{ problem.message }}
        </li>
      </ul>
      <button class="small" @click="copyProblems">{{ t('claude.copyProblems') }}</button>
    </div>
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
