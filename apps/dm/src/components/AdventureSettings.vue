<script setup lang="ts">
import {
  type Adventure,
  checkIntegrity,
  type Party,
  type ReviewHint,
  reviewAdventure,
} from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';
import { languageOptions } from '../lib/languages';
import { readNumberField } from '../lib/numbers';
import { describeHint as describeReviewHint } from '../lib/review';
import PartyAdapter from './PartyAdapter.vue';

/**
 * The adventure tab of the editor: title, summary, party, ruleset and languages, what is wrong
 * with the adventure and what could be better, and fitting it to a party.
 */
defineProps<{
  /** The game master's parties to choose from. */
  parties: Party[];
  /** The party the adventure is played with, if it is one of them. */
  party: Party | undefined;
}>();
const adventure = defineModel<Adventure>('adventure', { required: true });
/** Plays the adventure with a party, or with none when the id is empty. */
const emit = defineEmits<{ chooseParty: [partyId: string] }>();
const { t, locale } = useI18n();

const languages = computed(() => languageOptions(locale.value, adventure.value.language));
const problems = computed(() => checkIntegrity(adventure.value));
const hints = computed(() => reviewAdventure(adventure.value));

function describeHint(hint: ReviewHint): string {
  return describeReviewHint(t, adventure.value, hint);
}

function onParty(event: Event) {
  emit('chooseParty', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <section class="stack settings">
    <div class="card stack">
      <label class="field">
        <span>{{ t('adventure.title') }}</span>
        <input
          v-model="adventure.title"
          required
          @blur="fillIfBlank(adventure, 'title', t('library.untitled'))"
        />
      </label>
      <label class="field">
        <span>{{ t('adventure.summary') }}</span>
        <textarea v-model="adventure.summary" rows="5" :placeholder="t('adventure.summaryHint')" />
      </label>
      <div class="row">
        <label class="field">
          <span>{{ t('adventure.party') }}</span>
          <select :value="adventure.party.partyId ?? ''" @change="onParty">
            <option value="">{{ t('adventure.noParty') }}</option>
            <option
              v-if="adventure.party.partyId && !party"
              :value="adventure.party.partyId"
              disabled
            >
              {{ t('adventure.partyMissing') }}
            </option>
            <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('adventure.partySize') }}</span>
          <input
            :value="adventure.party.size"
            type="number"
            min="1"
            max="12"
            :disabled="!!party?.characters.length"
            @change="adventure.party.size = readNumberField($event, adventure.party.size, 1, 12)"
          />
        </label>
        <label class="field">
          <span>{{ t('adventure.partyLevel') }}</span>
          <input
            :value="adventure.party.level"
            type="number"
            min="1"
            max="20"
            :disabled="!!party?.characters.length"
            @change="adventure.party.level = readNumberField($event, adventure.party.level, 1, 20)"
          />
        </label>
        <label class="field">
          <span>{{ t('adventure.ruleset') }}</span>
          <select v-model="adventure.ruleset">
            <option value="srd-5.2">SRD 5.2</option>
            <option value="srd-5.1">SRD 5.1</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('adventure.language') }}</span>
          <select v-model="adventure.language">
            <option v-if="!adventure.language" :value="undefined">
              {{ t('adventure.languageNotSet') }}
            </option>
            <option v-for="language in languages" :key="language.tag" :value="language.tag">
              {{ language.name }}
            </option>
          </select>
        </label>
      </div>
      <p v-if="party" class="hint">
        {{ t('adventure.partyFollows', { name: party.name }) }}
        <RouterLink :to="{ name: 'party', query: { id: party.id } }">
          {{ t('adventure.editParty') }}
        </RouterLink>
      </p>
      <label v-if="adventure.language !== 'en'" class="inline">
        <input
          type="checkbox"
          :checked="adventure.termsLanguage === 'en'"
          @change="
            adventure.termsLanguage = ($event.target as HTMLInputElement).checked
              ? 'en'
              : undefined
          "
        />
        {{ t('adventure.englishTerms') }}
      </label>
      <div v-if="problems.length > 0" class="error" role="alert">
        <p>{{ t('editor.problems') }}</p>
        <ul>
          <li v-for="(problem, i) in problems" :key="i">
            <code>{{ problem.path }}</code> {{ problem.message }}
          </li>
        </ul>
      </div>
      <p v-else class="hint">{{ t('editor.noProblems') }}</p>
      <div v-if="hints.length > 0" class="stack">
        <p>{{ t('review.heading') }}</p>
        <ul class="review">
          <li v-for="(hint, i) in hints" :key="i">{{ describeHint(hint) }}</li>
        </ul>
      </div>
      <p v-else class="hint">{{ t('review.none') }}</p>
    </div>
    <PartyAdapter :key="adventure.id" :adventure="adventure" @replace="adventure = $event" />
  </section>
</template>

<style scoped>
.settings {
  max-width: 40rem;
}

.review {
  margin: 0;
  padding-left: 1.2rem;
}

.settings input[type='number'] {
  width: 6rem;
}
</style>
