<script setup lang="ts">
import {
  buildMonsterPrompt,
  CHALLENGE_RATINGS,
  formatChallengeRating,
  type IntegrityProblem,
  type Monster,
  parseMonster,
} from '@lorewarden/core';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractJson } from '../lib/extract-json';

const props = defineProps<{ language: string; termsLanguage?: string | undefined }>();
const emit = defineEmits<{ created: [monster: Monster] }>();

const { t } = useI18n();

const idea = ref('');
const cr = ref<number>();
const prompt = ref('');
const copied = ref(false);
const answer = ref('');
const problems = ref<IntegrityProblem[]>([]);

/** Copies instructions for the AI; shows them for manual copying if the clipboard is blocked. */
async function copyPrompt() {
  prompt.value = buildMonsterPrompt({
    idea: idea.value,
    cr: cr.value,
    language: props.language,
    termsLanguage: props.termsLanguage,
  });
  try {
    await navigator.clipboard.writeText(prompt.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function importAnswer() {
  const result = parseMonster(extractJson(answer.value));
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  problems.value = [];
  answer.value = '';
  emit('created', result.monster);
}

/** Copies the import errors so they can be pasted back to the AI for a fixed stat block. */
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
    <h2>{{ t('monsters.ai.heading') }}</h2>
    <p class="hint">{{ t('monsters.ai.intro') }}</p>
    <label class="field">
      <span>{{ t('monsters.ai.idea') }}</span>
      <textarea v-model="idea" rows="3" :placeholder="t('monsters.ai.ideaHint')" />
    </label>
    <div class="row end">
      <label class="field">
        <span>{{ t('monsters.ai.cr') }}</span>
        <select v-model="cr">
          <option :value="undefined">{{ t('monsters.ai.anyCr') }}</option>
          <option v-for="value in CHALLENGE_RATINGS" :key="value" :value="value">
            {{ formatChallengeRating(value) }}
          </option>
        </select>
      </label>
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
        {{ t('monsters.ai.import') }}
      </button>
    </div>
    <div v-if="problems.length > 0" class="error stack" role="alert">
      <p>{{ t('monsters.ai.importFailed') }}</p>
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
h2 {
  margin: 0;
}

.end {
  align-items: flex-end;
}
</style>
