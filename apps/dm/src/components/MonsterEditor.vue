<script setup lang="ts">
import {
  ABILITIES,
  type Ability,
  abilityModifier,
  CHALLENGE_RATINGS,
  formatChallengeRating,
  type Monster,
  monsterStatBlock,
  Size,
} from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { fillIfBlank } from '../lib/fallback';
import StatBlockView from './StatBlockView.vue';

const props = defineProps<{ monster: Monster }>();

const { t } = useI18n();
const { term } = useSettings();

const preview = ref(false);
const statBlock = computed(() => monsterStatBlock(props.monster));

type Section = 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions';
const sections: Section[] = ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'];
const details = ['skills', 'vulnerabilities', 'resistances', 'immunities'] as const;

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** A blank save means the ability modifier, so only proficient saves need typing. */
function setSave(ability: Ability, value: string) {
  const saves = { ...props.monster.saves };
  const number = Number.parseInt(value, 10);
  if (Number.isFinite(number)) saves[ability] = number;
  else delete saves[ability];
  props.monster.saves = saves;
}

function setInitiative(value: string) {
  const number = Number.parseInt(value, 10);
  props.monster.initiative = Number.isFinite(number) ? number : undefined;
}

function addFeature(section: Section) {
  props.monster[section].push({ name: t('monsters.newFeature'), text: '' });
}
</script>

<template>
  <div class="card stack monster-editor">
    <div class="row spread">
      <h2>{{ monster.name }}</h2>
      <button type="button" class="small" :aria-pressed="preview" @click="preview = !preview">
        {{ preview ? t('common.edit') : t('monsters.preview') }}
      </button>
    </div>
    <StatBlockView v-if="preview" :stat-block="statBlock" :source="monster.source" />
    <template v-else>
      <div class="row">
        <label class="field grow">
          <span>{{ t('monsters.name') }}</span>
          <input
            v-model="monster.name"
            required
            @blur="fillIfBlank(monster, 'name', t('common.untitled'))"
          />
        </label>
        <label class="field">
          <span>{{ t('monsters.size') }}</span>
          <select v-model="monster.size">
            <option v-for="size in Size.options" :key="size" :value="size">
              {{ t(`monsters.sizes.${size}`) }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('monsters.type') }}</span>
          <input
            v-model="monster.type"
            required
            :placeholder="t('monsters.typeHint')"
            @blur="fillIfBlank(monster, 'type', 'monstrosity')"
          />
        </label>
        <label class="field">
          <span>{{ t('monsters.alignment') }}</span>
          <input v-model="monster.alignment" />
        </label>
      </div>
      <div class="row">
        <label class="field">
          <span>{{ term('statBlock.cr') }}</span>
          <select v-model.number="monster.cr">
            <option v-for="cr in CHALLENGE_RATINGS" :key="cr" :value="cr">
              {{ formatChallengeRating(cr) }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ term('statBlock.ac') }}</span>
          <input v-model.number="monster.ac" type="number" min="0" max="40" required />
        </label>
        <label class="field">
          <span>{{ term('statBlock.hp') }}</span>
          <input v-model.number="monster.hp" type="number" min="1" required />
        </label>
        <label class="field">
          <span>{{ t('monsters.hitDice') }}</span>
          <input v-model="monster.hitDice" placeholder="2d8 + 2" />
        </label>
        <label class="field">
          <span>{{ term('statBlock.initiative') }}</span>
          <input
            type="number"
            :value="monster.initiative ?? ''"
            :placeholder="signed(abilityModifier(monster.abilities.dex))"
            @change="setInitiative(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="field grow">
          <span>{{ term('statBlock.speed') }}</span>
          <input v-model="monster.speed" placeholder="30 ft., Fly 60 ft." />
        </label>
      </div>
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
            <th scope="row">{{ t('monsters.score') }}</th>
            <td v-for="ability in ABILITIES" :key="ability">
              <input
                v-model.number="monster.abilities[ability]"
                type="number"
                min="1"
                max="30"
                required
                :aria-label="`${term(`statBlock.abilities.${ability}`)} ${t('monsters.score')}`"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">{{ term('statBlock.save') }}</th>
            <td v-for="ability in ABILITIES" :key="ability">
              <input
                type="number"
                :value="monster.saves[ability] ?? ''"
                :placeholder="signed(abilityModifier(monster.abilities[ability]))"
                :aria-label="`${term(`statBlock.abilities.${ability}`)} ${term('statBlock.save')}`"
                @change="setSave(ability, ($event.target as HTMLInputElement).value)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p class="hint">{{ t('monsters.savesHint') }}</p>
      <div class="grid">
        <label v-for="key in details" :key="key" class="field">
          <span>{{ term(`statBlock.${key}`) }}</span>
          <input v-model="monster[key]" />
        </label>
        <label class="field">
          <span>{{ term('statBlock.senses') }}</span>
          <input v-model="monster.senses" :placeholder="t('monsters.sensesHint')" />
        </label>
        <label class="field">
          <span>{{ term('statBlock.languages') }}</span>
          <input v-model="monster.languages" />
        </label>
      </div>
      <section v-for="section in sections" :key="section" class="stack features">
        <h3>{{ term(`statBlock.${section}`) }}</h3>
        <div v-for="(feature, i) in monster[section]" :key="i" class="feature">
          <div class="row">
            <input
              v-model="feature.name"
              class="grow"
              required
              :aria-label="t('monsters.featureName')"
              @blur="fillIfBlank(feature, 'name', t('monsters.newFeature'))"
            />
            <button type="button" class="small" @click="monster[section].splice(i, 1)">
              {{ t('common.remove') }}
            </button>
          </div>
          <textarea v-model="feature.text" rows="2" :aria-label="t('monsters.featureText')" />
        </div>
        <div class="row">
          <button type="button" class="small" @click="addFeature(section)">
            {{ t(`monsters.add.${section}`) }}
          </button>
        </div>
      </section>
      <label class="field">
        <span>{{ t('monsters.notes') }}</span>
        <textarea v-model="monster.notes" rows="3" :placeholder="t('monsters.notesHint')" />
      </label>
    </template>
    <slot />
  </div>
</template>

<style scoped>
.spread {
  justify-content: space-between;
  align-items: center;
}

h2,
h3 {
  margin: 0;
}

h3 {
  font-size: 1rem;
}

.grow {
  flex: 1 1 12rem;
}

.field input[type='number'] {
  width: 5rem;
}

.abilities {
  border-collapse: collapse;
}

.abilities th,
.abilities td {
  padding: 0.15rem;
  text-align: center;
}

.abilities th[scope='row'] {
  text-align: left;
  font-weight: 400;
  color: var(--muted);
  font-size: 0.85rem;
}

.abilities input {
  width: 3.75rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.5rem 1rem;
}

.feature {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
</style>
