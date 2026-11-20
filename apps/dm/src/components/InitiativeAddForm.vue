<script setup lang="ts">
import {
  addCombatants,
  type Combatant,
  createCombatant,
  rollInitiative,
  type Session,
} from '@lorewarden/core';
import { Plus } from '@lucide/vue';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { parseInteger } from '../lib/numbers';

/** Adds a combatant to the initiative by hand: name, initiative, hit points and kind. */
const session = defineModel<Session>('session', { required: true });
const { t } = useI18n();
const { term, autoRollInitiative } = useSettings();

const draft = reactive({
  name: '',
  initiative: undefined as number | undefined,
  hp: undefined as number | undefined,
  kind: 'pc' as Combatant['kind'],
});
const nameInput = ref<HTMLInputElement>();

/** Hit points of a new combatant; an empty field or a number below 1 means none. */
function setDraftHp(text: string) {
  const value = parseInteger(text);
  draft.hp = value !== undefined && value > 0 ? value : undefined;
}

function add() {
  const name = draft.name.trim();
  if (name === '') return;
  const combatant = createCombatant({
    name,
    kind: draft.kind,
    initiative: draft.initiative ?? 0,
    initiativeSource: draft.initiative !== undefined ? 'typed' : undefined,
    hp: draft.hp,
  });
  const added = addCombatants(session.value, [combatant]);
  // Monsters and NPCs without a typed value roll as they join; player characters roll themselves.
  session.value =
    autoRollInitiative.value && draft.kind !== 'pc' && draft.initiative === undefined
      ? rollInitiative(added, { ids: [combatant.id] })
      : added;
  draft.name = '';
  draft.initiative = undefined;
  draft.hp = undefined;
  nameInput.value?.focus();
}
</script>

<template>
  <form class="add" @submit.prevent="add">
    <input
      ref="nameInput"
      v-model="draft.name"
      :placeholder="t('initiative.name')"
      :aria-label="t('initiative.name')"
    />
    <input
      :value="draft.initiative ?? ''"
      type="number"
      :placeholder="t('initiative.initiativeShort')"
      :aria-label="t('initiative.initiative')"
      @input="draft.initiative = parseInteger(($event.target as HTMLInputElement).value)"
    />
    <input
      :value="draft.hp ?? ''"
      type="number"
      min="1"
      :placeholder="term('initiative.hpShort')"
      :aria-label="term('initiative.hp')"
      @input="setDraftHp(($event.target as HTMLInputElement).value)"
    />
    <select v-model="draft.kind" :aria-label="t('initiative.kind')">
      <option value="pc">{{ t('initiative.kinds.pc') }}</option>
      <option value="npc">{{ t('initiative.kinds.npc') }}</option>
      <option value="monster">{{ t('initiative.kinds.monster') }}</option>
    </select>
    <button type="submit"><Plus aria-hidden="true" />{{ t('initiative.add') }}</button>
  </form>
</template>

<style scoped>
.add {
  display: grid;
  grid-template-columns: 1fr 4.5rem 4.5rem auto auto;
  gap: 0.4rem;
}

@media (max-width: 480px) {
  .add {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
