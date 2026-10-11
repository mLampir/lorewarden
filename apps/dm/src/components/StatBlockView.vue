<script setup lang="ts">
import {
  ABILITIES,
  abilityModifier,
  experiencePoints,
  formatChallengeRating,
  type StatBlock,
  type StatBlockFeature,
} from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';

const props = defineProps<{ statBlock: StatBlock }>();

const { t } = useI18n();
const { term } = useSettings();

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** Proficiency bonus by challenge rating: +2 up to CR 4, then one more every four ratings. */
const proficiency = computed(() => 2 + Math.floor((Math.max(props.statBlock.cr, 1) - 1) / 4));

const details = computed(() => {
  const s = props.statBlock;
  return [
    ['skills', s.skills],
    ['vulnerabilities', s.vulnerabilities],
    ['resistances', s.resistances],
    ['immunities', s.immunities],
    ['senses', s.senses],
    ['languages', s.languages],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
});

const sections = computed(() => {
  const s = props.statBlock;
  return [
    ['traits', s.traits],
    ['actions', s.actions],
    ['bonusActions', s.bonusActions],
    ['reactions', s.reactions],
    ['legendaryActions', s.legendaryActions],
  ].filter((entry): entry is [string, StatBlockFeature[]] => (entry[1]?.length ?? 0) > 0);
});

/** The source marks a few words in bold with Markdown; plain text reads fine without it. */
const plain = (text: string) => text.replaceAll('**', '');
</script>

<template>
  <article class="stat-block">
    <header>
      <h4>{{ statBlock.name }}</h4>
      <p class="muted kind">{{ statBlock.size }} {{ statBlock.type }}, {{ statBlock.alignment }}</p>
    </header>
    <p class="core">
      <span><strong>{{ term('statBlock.ac') }}</strong> {{ statBlock.ac }}</span>
      <span>
        <strong>{{ term('statBlock.initiative') }}</strong>
        {{ signed(statBlock.initiative) }} ({{ 10 + statBlock.initiative }})
      </span>
      <span>
        <strong>{{ term('statBlock.hp') }}</strong> {{ statBlock.hp }} ({{ statBlock.hitDice }})
      </span>
      <span><strong>{{ term('statBlock.speed') }}</strong> {{ statBlock.speed }}</span>
    </p>
    <table class="abilities">
      <thead>
        <tr>
          <th scope="col"></th>
          <th v-for="ability in ABILITIES" :key="ability" scope="col">
            {{ term(`statBlock.abilities.${ability}`) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row"></th>
          <td v-for="ability in ABILITIES" :key="ability" class="score">
            {{ statBlock.abilities[ability] }}
          </td>
        </tr>
        <tr>
          <th scope="row">{{ term('statBlock.mod') }}</th>
          <td v-for="ability in ABILITIES" :key="ability">
            {{ signed(abilityModifier(statBlock.abilities[ability])) }}
          </td>
        </tr>
        <tr>
          <th scope="row">{{ term('statBlock.save') }}</th>
          <td v-for="ability in ABILITIES" :key="ability">
            {{ signed(statBlock.saves[ability]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <dl class="details">
      <div v-for="[key, value] in details" :key="key">
        <dt>{{ term(`statBlock.${key}`) }}</dt>
        <dd>{{ value }}</dd>
      </div>
      <div>
        <dt>{{ term('statBlock.cr') }}</dt>
        <dd>
          {{ formatChallengeRating(statBlock.cr) }} ({{ term('statBlock.xp') }}
          {{ experiencePoints(statBlock.cr) }}; {{ term('statBlock.pb') }} +{{ proficiency }})
        </dd>
      </div>
    </dl>
    <section v-for="[key, features] in sections" :key="key">
      <h5>{{ term(`statBlock.${key}`) }}</h5>
      <p v-for="feature in features" :key="feature.name" class="feature">
        <strong>{{ feature.name }}.</strong> {{ plain(feature.text) }}
      </p>
    </section>
    <p class="hint">{{ t('statBlock.source') }}</p>
  </article>
</template>

<style scoped>
.stat-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 3px solid var(--danger);
  border-radius: var(--radius);
  font-size: 0.925rem;
}

h4,
h5,
p {
  margin: 0;
}

h4 {
  font-size: 1.1rem;
}

h5 {
  font-size: 0.95rem;
  color: var(--danger);
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.3rem;
}

.kind {
  font-style: italic;
  text-transform: capitalize;
}

.core {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
}

.abilities {
  border-collapse: collapse;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.abilities th,
.abilities td {
  padding: 0.1rem 0.3rem;
}

.abilities th[scope='row'] {
  text-align: left;
  font-weight: 400;
  color: var(--muted);
  font-size: 0.8rem;
}

.abilities .score {
  font-weight: 600;
}

.details {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.details div {
  display: flex;
  gap: 0.4rem;
}

.details dt {
  font-weight: 600;
}

.details dd {
  margin: 0;
}

.feature {
  white-space: pre-line;
  margin-bottom: 0.35rem;
}
</style>
