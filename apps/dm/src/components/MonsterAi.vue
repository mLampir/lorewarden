<script setup lang="ts">
import {
  buildMonsterPrompt,
  CHALLENGE_RATINGS,
  formatChallengeRating,
  type Monster,
  parseMonster,
} from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import type { ClaudeTask } from '../lib/claude';
import AiExchange from './AiExchange.vue';
import AiHandoff from './AiHandoff.vue';

const props = defineProps<{
  language: string;
  termsLanguage?: string | undefined;
  /** The adventure the monster is for; without it, it goes into the monster library. */
  adventure?: { id: string; title: string };
}>();
const emit = defineEmits<{ created: [monster: Monster] }>();

const { t } = useI18n();
const { term } = useSettings();

const idea = ref('');
const cr = ref<number>();

const task = computed<ClaudeTask>(() => ({
  task: 'new_monster',
  idea: idea.value,
  cr: cr.value === undefined ? undefined : formatChallengeRating(cr.value),
  adventure: props.adventure?.id,
  language: props.language,
  rulesTerms: props.termsLanguage ?? 'same',
}));
const request = computed(() =>
  props.adventure
    ? t('ai.tasks.newMonsterFor', { title: props.adventure.title })
    : t('ai.tasks.newMonster'),
);

const buildPrompt = () =>
  buildMonsterPrompt({
    idea: idea.value,
    cr: cr.value,
    language: props.language,
    termsLanguage: props.termsLanguage,
  });

function parse(json: string) {
  const result = parseMonster(json);
  return result.ok ? { ok: true as const, value: result.monster } : result;
}

function take(monster: Monster) {
  emit('created', monster);
  return undefined;
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
    <label class="field cr">
      <span>{{ term('monsters.ai.cr') }}</span>
      <select v-model="cr">
        <option :value="undefined">{{ t('monsters.ai.anyCr') }}</option>
        <option v-for="value in CHALLENGE_RATINGS" :key="value" :value="value">
          {{ formatChallengeRating(value) }}
        </option>
      </select>
    </label>
    <AiHandoff :task="task" :request="request">
      <AiExchange
        :build-prompt="buildPrompt"
        :parse="parse"
        :take="take"
        :import-label="t('monsters.ai.import')"
        :failed-label="t('monsters.ai.importFailed')"
      />
    </AiHandoff>
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
}

.cr {
  align-self: flex-start;
}
</style>
