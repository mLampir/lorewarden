<script setup lang="ts" generic="T">
import { Sparkles } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { type AiAnswer, useAiExchange } from '../composables/useAiExchange';

/**
 * Copies the instructions for an AI and imports its answer, for AI assistants without the
 * Lorewarden connector. steps numbers the three steps, for a dialog that is about nothing else.
 */
const props = defineProps<{
  /** Builds the instructions when the game master copies them. */
  buildPrompt: () => string;
  /** Reads the JSON of the pasted answer. */
  parse: (json: string) => AiAnswer<T>;
  /** Takes the imported value; returning false keeps the answer, e.g. after a cancel. */
  take: (value: T) => boolean | undefined | Promise<boolean | undefined>;
  importLabel: string;
  /** Said above the problems of an answer that does not fit. */
  failedLabel?: string;
  disabled?: boolean;
  steps?: boolean;
}>();
const { t } = useI18n();
const { prompt, copied, answer, problems, copyPrompt, importAnswer, copyProblems } =
  useAiExchange();
</script>

<template>
  <component :is="steps ? 'ol' : 'div'" :class="steps ? 'steps' : 'stack'">
    <component :is="steps ? 'li' : 'div'">
      <div class="stack">
        <span v-if="steps">{{ t('claude.step1') }}</span>
        <div class="row">
          <button
            :class="{ primary: steps }"
            :disabled="disabled"
            @click="copyPrompt(props.buildPrompt())"
          >
            <Sparkles v-if="steps" aria-hidden="true" />{{ t('claude.copyPrompt') }}
          </button>
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
      </div>
    </component>
    <li v-if="steps">{{ t('claude.step2') }}</li>
    <component :is="steps ? 'li' : 'div'">
      <div class="stack">
        <span v-if="steps">{{ t('claude.step3') }}</span>
        <label class="field">
          <span :class="{ 'sr-only': steps }">{{ t('claude.answer') }}</span>
          <textarea v-model="answer" rows="4" :placeholder="t('claude.answerHint')" />
        </label>
        <div class="row">
          <button
            :disabled="disabled || answer.trim() === ''"
            @click="importAnswer(props.parse, props.take)"
          >
            {{ importLabel }}
          </button>
        </div>
      </div>
    </component>
  </component>
  <div v-if="problems.length > 0" class="error stack" role="alert">
    <p>{{ failedLabel ?? t('claude.importFailed') }}</p>
    <ul>
      <li v-for="(problem, i) in problems.slice(0, 10)" :key="i">
        <code v-if="problem.path">{{ problem.path }}</code> {{ problem.message }}
      </li>
    </ul>
    <div>
      <button class="small" @click="copyProblems">{{ t('claude.copyProblems') }}</button>
    </div>
  </div>
</template>

<style scoped>
.steps {
  margin: 0;
  padding-left: 1.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
