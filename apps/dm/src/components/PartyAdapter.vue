<script setup lang="ts">
import {
  type Adventure,
  buildAdaptPrompt,
  copyAdventure,
  type IntegrityProblem,
  parseAdaptedAdventure,
  partyOf,
} from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useParties } from '../composables/useParties';
import { extractJson } from '../lib/extract-json';
import { saveAdventure } from '../storage/database';

const props = defineProps<{ adventure: Adventure }>();
const emit = defineEmits<{ replace: [adventure: Adventure] }>();

const { t } = useI18n();
const router = useRouter();
const { monsters: ownMonsters } = useMonsterLibrary();
const { parties } = useParties();

const size = ref(props.adventure.party.size);
const level = ref(props.adventure.party.level);
const linked = computed(() => partyOf(props.adventure, parties.value));
const prompt = ref('');
const copied = ref(false);
const answer = ref('');
const problems = ref<IntegrityProblem[]>([]);

/** Keeps the original as it is and opens a copy for the other group. */
async function duplicate() {
  const party = { size: size.value, level: level.value };
  const title = t('adapt.copyTitle', { title: props.adventure.title, ...party });
  // The copy is for another group, so it no longer follows the party of the original.
  const { partyId: _, levels: __, ...rest } = props.adventure.party;
  const copy = copyAdventure(props.adventure, title, { ...rest, ...party });
  await saveAdventure(copy);
  await router.push({ name: 'edit', params: { id: copy.id } });
}

/** Copies instructions for the AI; shows them for manual copying if the clipboard is blocked. */
async function copyPrompt() {
  prompt.value = buildAdaptPrompt(props.adventure, new Date(), ownMonsters.value, linked.value);
  try {
    await navigator.clipboard.writeText(prompt.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function importAnswer() {
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
  emit('replace', result.adventure);
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
    <p class="hint">{{ t('adapt.intro') }}</p>
    <form class="row end" @submit.prevent="duplicate">
      <label class="field">
        <span>{{ t('adventure.partySize') }}</span>
        <input v-model.number="size" type="number" min="1" max="12" required />
      </label>
      <label class="field">
        <span>{{ t('adventure.partyLevel') }}</span>
        <input v-model.number="level" type="number" min="1" max="20" required />
      </label>
      <button type="submit">{{ t('adapt.duplicate') }}</button>
    </form>

    <label class="field">
      <span>{{ t('adapt.characters') }}</span>
      <textarea
        v-model="adventure.party.characters"
        rows="4"
        :placeholder="t('adapt.charactersHint')"
      />
    </label>
    <p class="hint">
      {{ linked ? t('adapt.fromParty', { name: linked.name }) : t('adapt.charactersNote') }}
    </p>

    <h3>{{ t('adapt.aiHeading') }}</h3>
    <p class="hint">
      {{ t('adapt.aiIntro', { size: adventure.party.size, level: adventure.party.level }) }}
    </p>
    <div class="row">
      <button @click="copyPrompt">{{ t('claude.copyPrompt') }}</button>
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
  </div>
</template>

<style scoped>
.end {
  align-items: flex-end;
}

h3 {
  margin: 0.5rem 0 0;
}

.field input[type='number'] {
  width: 6rem;
}
</style>
