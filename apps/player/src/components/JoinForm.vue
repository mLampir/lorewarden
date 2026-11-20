<script setup lang="ts">
import type { TableInfo } from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SOMEONE_ELSE } from '../lib/join';
import type { TableStatus } from '../lib/table';

/** The join screen: the character to play or the player's name, and the table's code. */
const props = defineProps<{ status: TableStatus; characters: TableInfo['characters'] }>();
const name = defineModel<string>('name', { required: true });
const code = defineModel<string>('code', { required: true });
const characterId = defineModel<string>('characterId', { required: true });
const emit = defineEmits<{ submit: [] }>();
const { t } = useI18n();

const picked = computed(() => props.characters.find((c) => c.id === characterId.value));
</script>

<template>
  <form class="card stack" @submit.prevent="emit('submit')">
    <p>{{ t('app.tagline') }}</p>
    <p v-if="status === 'wrong-code'" class="error" role="alert">{{ t('join.wrongCode') }}</p>
    <fieldset v-if="characters.length > 0" class="field characters">
      <legend>{{ t('join.character') }}</legend>
      <label v-for="character in characters" :key="character.id" class="choice">
        <input v-model="characterId" type="radio" name="character" :value="character.id" />
        <span>{{ character.name }}</span>
        <small v-if="character.taken" class="muted">{{ t('join.taken') }}</small>
      </label>
      <label class="choice">
        <input v-model="characterId" type="radio" name="character" :value="SOMEONE_ELSE" />
        <span>{{ t('join.someoneElse') }}</span>
      </label>
    </fieldset>
    <label v-if="!picked" class="field">
      <span>{{ t('join.name') }}</span>
      <input v-model="name" required maxlength="40" autocomplete="nickname" />
      <small class="muted">{{ t('join.nameHint') }}</small>
    </label>
    <label class="field">
      <span>{{ t('join.code') }}</span>
      <input
        v-model="code"
        required
        maxlength="6"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        class="code"
      />
      <small class="muted">{{ t('join.codeHint') }}</small>
    </label>
    <button class="primary" type="submit">{{ t('join.submit') }}</button>
  </form>
</template>

<style scoped>
.characters {
  margin: 0;
  padding: 0;
  border: none;
}

.characters legend {
  margin-bottom: 0.35rem;
  padding: 0;
  font-weight: 600;
}

.choice {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.choice:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.choice input {
  margin: 0;
  accent-color: var(--accent);
}

.choice small {
  margin-left: auto;
}

.code {
  font-family: ui-monospace, monospace;
  font-size: 1.4rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

</style>
