<script setup lang="ts">
import type { PlayerCharacter } from '@lorewarden/core';
import { Smartphone, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { fillIfBlank } from '../lib/fallback';

/** One player character of a party: only what the game master needs at the table. */
const props = defineProps<{ character: PlayerCharacter }>();
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
const { term } = useSettings();

type NumberField = 'ac' | 'maxHp' | 'passivePerception' | 'initiativeBonus';
const numbers: { key: NumberField; label: string; min?: number }[] = [
  { key: 'ac', label: 'party.ac', min: 0 },
  { key: 'maxHp', label: 'party.maxHp', min: 1 },
  { key: 'passivePerception', label: 'party.passivePerception' },
  { key: 'initiativeBonus', label: 'party.initiativeBonus' },
];

/** An empty field leaves the value out instead of storing an invalid number. */
function setNumber(key: NumberField, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (Number.isNaN(value)) delete props.character[key];
  else props.character[key] = value;
}

function setLevel(event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  props.character.level = Number.isNaN(value) ? 1 : Math.min(Math.max(value, 1), 20);
}
</script>

<template>
  <article class="card stack character">
    <p v-if="character.ownerId" class="from-phone">
      <Smartphone aria-hidden="true" />{{ t('party.fromPhone') }}
    </p>
    <div class="row">
      <label class="field grow">
        <span>{{ t('party.characterName') }}</span>
        <input
          v-model="character.name"
          required
          maxlength="60"
          @blur="fillIfBlank(character, 'name', t('common.untitled'))"
        />
      </label>
      <label class="field grow">
        <span>{{ t('party.player') }}</span>
        <input v-model="character.player" maxlength="40" :placeholder="t('party.playerHint')" />
      </label>
      <label class="field grow">
        <span>{{ term('party.className') }}</span>
        <input v-model="character.className" maxlength="60" :placeholder="t('party.classHint')" />
      </label>
      <label class="field small-number">
        <span>{{ term('party.level') }}</span>
        <input :value="character.level" type="number" min="1" max="20" @change="setLevel" />
      </label>
    </div>
    <div class="row numbers">
      <label v-for="field in numbers" :key="field.key" class="field small-number">
        <span>{{ term(field.label) }}</span>
        <input
          :value="character[field.key]"
          type="number"
          :min="field.min"
          inputmode="numeric"
          @change="setNumber(field.key, $event)"
        />
      </label>
    </div>
    <label v-if="character.ownerId || character.playerNotes" class="field">
      <span>{{ t('party.playerNotes') }}</span>
      <textarea v-model="character.playerNotes" rows="2" maxlength="2000" />
    </label>
    <label class="field">
      <span>{{ t('party.notes') }}</span>
      <textarea
        v-model="character.notes"
        class="secret-input"
        rows="3"
        :placeholder="t('party.notesHint')"
      />
      <small class="hint">{{ t('common.notesSyntax') }}</small>
    </label>
    <div class="row">
      <button class="ghost small" type="button" @click="emit('remove')">
        <Trash2 aria-hidden="true" />{{ t('party.removeCharacter') }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.grow {
  flex: 1 1 10rem;
}

.small-number {
  flex: 0 1 7.5rem;
}

.small-number input {
  width: 100%;
}

.from-phone {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
}

.from-phone svg {
  width: 0.85rem;
  height: 0.85rem;
}

/* Labels that wrap on a phone keep the fields in one line. */
.numbers {
  align-items: flex-end;
}
</style>
