<script setup lang="ts">
import {
  type Adventure,
  addCombatants,
  adjustHp,
  CONDITIONS,
  type Combatant,
  createCombatant,
  endCombat,
  nextTurn,
  previousTurn,
  type ResolvedMonster,
  removeCombatant,
  renameCombatant,
  resolvePoolMonster,
  type Session,
  setInitiative,
  startCombat,
  toggleCondition,
} from '@lorewarden/core';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { hasMonsterDetails } from '../lib/monster';
import MonsterDetails from './MonsterDetails.vue';

const props = defineProps<{ adventure?: Adventure }>();
const session = defineModel<Session>('session', { required: true });
const { t } = useI18n();
const { term } = useSettings();

const draft = reactive({
  name: '',
  initiative: undefined as number | undefined,
  hp: undefined as number | undefined,
  kind: 'pc' as Combatant['kind'],
});
const nameInput = ref<HTMLInputElement>();
/** Amount typed per combatant for the damage and heal buttons. */
const amounts = reactive<Record<string, number | undefined>>({});
/** Combatants whose stat block is open. */
const openStats = reactive(new Set<string>());

/** Stat block and attacks of monsters that came from an encounter of the adventure. */
const monsters = computed(() => {
  const result = new Map<string, ResolvedMonster>();
  const adventure = props.adventure;
  if (!adventure) return result;
  for (const combatant of session.value.initiative) {
    const pool = adventure.monsterPool.find((m) => m.id === combatant.ref);
    if (combatant.kind !== 'monster' || !pool) continue;
    const resolved = resolvePoolMonster(adventure, pool);
    if (hasMonsterDetails(resolved)) result.set(combatant.id, resolved);
  }
  return result;
});

function toggleStats(id: string) {
  if (!openStats.delete(id)) openStats.add(id);
}

const activeId = computed(() => {
  const combat = session.value.combat;
  return combat ? session.value.initiative[combat.turn]?.id : undefined;
});

function add() {
  const name = draft.name.trim();
  if (name === '') return;
  const combatant = createCombatant({
    name,
    kind: draft.kind,
    initiative: draft.initiative ?? 0,
    hp: draft.hp,
  });
  session.value = addCombatants(session.value, [combatant]);
  draft.name = '';
  draft.initiative = undefined;
  draft.hp = undefined;
  nameInput.value?.focus();
}

function changeHp(id: string, sign: 1 | -1) {
  const amount = amounts[id];
  if (!amount) return;
  session.value = adjustHp(session.value, id, sign * Math.abs(amount));
  amounts[id] = undefined;
}

function onInitiative(id: string, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (!Number.isNaN(value)) session.value = setInitiative(session.value, id, value);
}

function onRename(id: string, event: Event) {
  session.value = renameCombatant(session.value, id, (event.target as HTMLInputElement).value);
}

function onCondition(id: string, event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value) session.value = toggleCondition(session.value, id, select.value);
  select.value = '';
}

function end() {
  if (window.confirm(t('initiative.endConfirm'))) session.value = endCombat(session.value);
}

function conditionLabel(key: string) {
  return (CONDITIONS as readonly string[]).includes(key) ? term(`conditions.${key}`) : key;
}
</script>

<template>
  <section class="card stack tracker" :aria-label="t('initiative.heading')">
    <header class="row spread">
      <h2>
        {{ t('initiative.heading') }}
        <span v-if="session.combat" class="round">
          {{ t('initiative.round', { round: session.combat.round }) }}
        </span>
      </h2>
      <div class="row">
        <template v-if="session.combat">
          <button class="small" @click="session = previousTurn(session)">
            {{ t('initiative.previous') }}
          </button>
          <button class="small primary" @click="session = nextTurn(session)">
            {{ t('initiative.next') }}
          </button>
          <button class="small" @click="end">{{ t('initiative.end') }}</button>
        </template>
        <button
          v-else
          class="small primary"
          :disabled="session.initiative.length === 0"
          @click="session = startCombat(session)"
        >
          {{ t('initiative.start') }}
        </button>
      </div>
    </header>

    <p v-if="session.initiative.length === 0" class="hint">{{ t('initiative.empty') }}</p>
    <ol class="list combatants">
      <li
        v-for="combatant in session.initiative"
        :key="combatant.id"
        class="combatant"
        :class="[combatant.kind, { active: combatant.id === activeId, down: combatant.hp?.current === 0 }]"
        :aria-current="combatant.id === activeId ? 'step' : undefined"
      >
        <input
          class="init"
          type="number"
          :value="combatant.initiative"
          :aria-label="t('initiative.initiativeOf', { name: combatant.name })"
          @change="onInitiative(combatant.id, $event)"
        />
        <input
          class="name"
          :value="combatant.name"
          :aria-label="t('initiative.name')"
          @change="onRename(combatant.id, $event)"
        />
        <button
          class="small danger remove"
          :aria-label="t('initiative.removeOne', { name: combatant.name })"
          @click="session = removeCombatant(session, combatant.id)"
        >
          ×
        </button>
        <div class="details">
          <span class="kind">{{ t(`initiative.kinds.${combatant.kind}`) }}</span>
          <span v-if="combatant.hp" class="hp">
            <span class="hp-value" :title="term('initiative.hp')">
              {{ combatant.hp.current }}/{{ combatant.hp.max }}
            </span>
            <input
              v-model.number="amounts[combatant.id]"
              type="number"
              min="0"
              class="amount"
              :aria-label="t('initiative.amount')"
              @keydown.enter.prevent="changeHp(combatant.id, -1)"
            />
            <button
              class="small"
              :title="t('initiative.damage')"
              :aria-label="t('initiative.damage')"
              @click="changeHp(combatant.id, -1)"
            >
              −
            </button>
            <button
              class="small"
              :title="t('initiative.heal')"
              :aria-label="t('initiative.heal')"
              @click="changeHp(combatant.id, 1)"
            >
              +
            </button>
          </span>
          <button
            v-for="condition in combatant.conditions"
            :key="condition"
            class="small tag"
            :title="t('initiative.removeCondition')"
            @click="session = toggleCondition(session, combatant.id, condition)"
          >
            {{ conditionLabel(condition) }} ×
          </button>
          <button
            v-if="monsters.has(combatant.id)"
            class="small"
            :aria-expanded="openStats.has(combatant.id)"
            @click="toggleStats(combatant.id)"
          >
            {{ t('statBlock.show') }}
          </button>
          <select
            class="add-condition"
            :aria-label="t('initiative.addCondition')"
            @change="onCondition(combatant.id, $event)"
          >
            <option value="">{{ t('initiative.addCondition') }}</option>
            <option
              v-for="condition in CONDITIONS.filter((c) => !combatant.conditions.includes(c))"
              :key="condition"
              :value="condition"
            >
              {{ term(`conditions.${condition}`) }}
            </option>
          </select>
        </div>
        <MonsterDetails
          v-if="openStats.has(combatant.id) && monsters.has(combatant.id)"
          class="stats"
          :monster="monsters.get(combatant.id) as ResolvedMonster"
        />
      </li>
    </ol>

    <form class="add" @submit.prevent="add">
      <input
        ref="nameInput"
        v-model="draft.name"
        :placeholder="t('initiative.name')"
        :aria-label="t('initiative.name')"
      />
      <input
        v-model.number="draft.initiative"
        type="number"
        :placeholder="t('initiative.initiativeShort')"
        :aria-label="t('initiative.initiative')"
      />
      <input
        v-model.number="draft.hp"
        type="number"
        min="1"
        :placeholder="term('initiative.hpShort')"
        :aria-label="term('initiative.hp')"
      />
      <select v-model="draft.kind" :aria-label="t('initiative.kind')">
        <option value="pc">{{ t('initiative.kinds.pc') }}</option>
        <option value="npc">{{ t('initiative.kinds.npc') }}</option>
        <option value="monster">{{ t('initiative.kinds.monster') }}</option>
      </select>
      <button type="submit">{{ t('initiative.add') }}</button>
    </form>
  </section>
</template>

<style scoped>
.spread {
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 1.125rem;
}

.round {
  font-weight: 400;
  color: var(--muted);
  font-size: 0.925rem;
  margin-left: 0.4rem;
}

.combatants {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.combatant {
  display: grid;
  grid-template-columns: 3.2rem 1fr auto;
  grid-template-areas:
    'init name remove'
    'init details details'
    'stats stats stats';
  gap: 0.25rem 0.5rem;
  align-items: center;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 6px;
}

.combatant.pc {
  border-left-color: var(--ok);
}

.combatant.monster {
  border-left-color: var(--danger);
}

.combatant.npc {
  border-left-color: var(--focus);
}

.combatant.active {
  background: var(--surface-2);
  outline: 2px solid var(--accent);
}

.combatant.down .name {
  text-decoration: line-through;
  color: var(--muted);
}

.init {
  grid-area: init;
  width: 100%;
  padding: 0.3rem 0.2rem;
  text-align: center;
  font-weight: 700;
}

.name {
  grid-area: name;
  width: 100%;
  border-color: transparent;
  background: transparent;
  font-weight: 600;
}

.name:hover,
.name:focus {
  border-color: var(--border);
}

.remove {
  grid-area: remove;
}

.details {
  grid-area: details;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}

.stats {
  grid-area: stats;
}

.kind {
  font-size: 0.75rem;
  color: var(--muted);
  min-width: 3.5rem;
}

.hp {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.hp-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.amount {
  width: 3.2rem;
  padding: 0.1rem 0.3rem;
}

.add-condition {
  font-size: 0.8rem;
  padding: 0.1rem 0.3rem;
  color: var(--muted);
}

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
