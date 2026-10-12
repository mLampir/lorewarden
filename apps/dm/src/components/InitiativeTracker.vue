<script setup lang="ts">
import {
  type Adventure,
  addCombatants,
  adjustHp,
  askForInitiative,
  CONDITIONS,
  type Combatant,
  createCombatant,
  endCombat,
  initiativeDie,
  nextTurn,
  type Player,
  previousTurn,
  type ResolvedMonster,
  removeCombatant,
  renameCombatant,
  resolvePoolMonster,
  rollInitiative,
  type Session,
  setInitiative,
  startCombat,
  stopAskingForInitiative,
  toggleCondition,
} from '@lorewarden/core';
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  Heart,
  Minus,
  Plus,
  Smartphone,
  Square,
  Swords,
  X,
} from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { hasMonsterDetails } from '../lib/monster';
import MonsterDetails from './MonsterDetails.vue';

const props = withDefaults(
  defineProps<{
    adventure?: Adventure;
    /** Players connected with the player app, who can send their initiative. */
    players?: Player[];
  }>(),
  { players: () => [] },
);
const session = defineModel<Session>('session', { required: true });
const { t } = useI18n();
const { term, autoRollInitiative, shareInitiativeRolls, askPlayersForInitiative } = useSettings();

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

/** Monsters and NPCs whose initiative was not typed in; the roll button rolls for them. */
const rollable = computed(() =>
  session.value.initiative.filter((c) => c.kind !== 'pc' && c.initiativeSource !== 'typed'),
);

function roll(ids: string[]) {
  session.value = rollInitiative(session.value, { ids, shareRolls: shareInitiativeRolls.value });
}

function start() {
  let next = autoRollInitiative.value
    ? rollInitiative(session.value, { shareRolls: shareInitiativeRolls.value })
    : session.value;
  if (askPlayersForInitiative.value && props.players.length > 0 && !next.initiativeRequest) {
    next = askForInitiative(next);
  }
  session.value = startCombat(next);
}

/** Players at the table who have not sent their initiative yet. */
const missing = computed(() => {
  const answered = session.value.initiativeRequest?.answered ?? [];
  return props.players.filter((player) => !answered.includes(player.id));
});

/** Shows how a rolled initiative came about, e.g. "d20: 14 + 2", or that a player sent it. */
function rollTitle(combatant: Combatant): string | undefined {
  if (combatant.initiativeSource === 'player') return t('initiative.fromPhone');
  const die = initiativeDie(combatant);
  if (die === undefined) return undefined;
  const bonus = combatant.initiativeBonus ?? 0;
  return t('initiative.rolled', { die, bonus: bonus < 0 ? `− ${-bonus}` : `+ ${bonus}` });
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
      <h2 class="inline">
        <Swords aria-hidden="true" />{{ t('initiative.heading') }}
        <span v-if="session.combat" class="round">
          {{ t('initiative.round', { round: session.combat.round }) }}
        </span>
      </h2>
      <div class="row">
        <template v-if="session.combat">
          <button
            class="small icon-only"
            :title="t('initiative.previous')"
            :aria-label="t('initiative.previous')"
            @click="session = previousTurn(session)"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button class="small primary" @click="session = nextTurn(session)">
            {{ t('initiative.next') }}<ChevronRight aria-hidden="true" />
          </button>
          <button
            class="small ghost icon-only"
            :title="t('initiative.end')"
            :aria-label="t('initiative.end')"
            @click="end"
          >
            <Square aria-hidden="true" />
          </button>
        </template>
        <template v-else>
          <button
            v-if="players.length > 0 && !session.initiativeRequest"
            class="small icon-only"
            :title="t('initiative.askPlayers')"
            :aria-label="t('initiative.askPlayers')"
            @click="session = askForInitiative(session)"
          >
            <Smartphone aria-hidden="true" />
          </button>
          <button
            class="small"
            :disabled="rollable.length === 0"
            :title="t('initiative.rollAllHint')"
            @click="roll(rollable.map((c) => c.id))"
          >
            <Dices aria-hidden="true" />{{ t('initiative.rollAll') }}
          </button>
          <button
            class="small primary"
            :disabled="session.initiative.length === 0"
            :title="autoRollInitiative ? t('initiative.startRollsHint') : undefined"
            @click="start"
          >
            <Swords aria-hidden="true" />{{ t('initiative.start') }}
          </button>
        </template>
      </div>
    </header>

    <div v-if="session.initiativeRequest" class="asking" role="status">
      <Smartphone aria-hidden="true" />
      <span>
        {{
          missing.length > 0
            ? t('initiative.waitingFor', { names: missing.map((p) => p.name).join(', ') })
            : t('initiative.allAnswered')
        }}
      </span>
      <button class="small ghost" @click="session = stopAskingForInitiative(session)">
        {{ t('initiative.stopAsking') }}
      </button>
    </div>

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
          :title="rollTitle(combatant)"
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
          class="small ghost icon-only remove"
          :title="t('initiative.removeOne', { name: combatant.name })"
          :aria-label="t('initiative.removeOne', { name: combatant.name })"
          @click="session = removeCombatant(session, combatant.id)"
        >
          <X aria-hidden="true" />
        </button>
        <div class="details">
          <span class="kind">{{ t(`initiative.kinds.${combatant.kind}`) }}</span>
          <button
            v-if="combatant.kind !== 'pc'"
            class="small ghost icon-only"
            :title="t('initiative.rollOneHint')"
            :aria-label="t('initiative.rollOne', { name: combatant.name })"
            @click="roll([combatant.id])"
          >
            <Dices aria-hidden="true" />
          </button>
          <span v-if="combatant.hp" class="hp">
            <span class="hp-value" :title="term('initiative.hp')">
              <Heart aria-hidden="true" />{{ combatant.hp.current }}/{{ combatant.hp.max }}
            </span>
            <input
              v-model.number="amounts[combatant.id]"
              type="number"
              min="0"
              class="amount"
              :aria-label="t('initiative.amount')"
              :placeholder="t('initiative.amountShort')"
              @keydown.enter.prevent="changeHp(combatant.id, -1)"
            />
            <button
              class="small"
              :title="t('initiative.damage')"
              :aria-label="t('initiative.damage')"
              @click="changeHp(combatant.id, -1)"
            >
              <Minus aria-hidden="true" />
            </button>
            <button
              class="small"
              :title="t('initiative.heal')"
              :aria-label="t('initiative.heal')"
              @click="changeHp(combatant.id, 1)"
            >
              <Plus aria-hidden="true" />
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
      <button type="submit"><Plus aria-hidden="true" />{{ t('initiative.add') }}</button>
    </form>
  </section>
</template>

<style scoped>
.spread {
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 1.1rem;
}

h2 svg {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--accent);
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
  background: var(--surface);
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
  background: var(--accent-soft);
  outline: 2px solid var(--accent);
}

.combatant.down .name {
  text-decoration: line-through;
  color: var(--muted);
}

.init {
  grid-area: init;
  width: 100%;
  padding: 0.35rem 0.2rem;
  text-align: center;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  appearance: textfield;
  -moz-appearance: textfield;
}

.init::-webkit-inner-spin-button,
.init::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
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
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.hp-value svg {
  width: 0.9rem;
  height: 0.9rem;
  color: var(--danger);
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

.asking {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  background: var(--accent-soft);
  font-size: 0.875rem;
}

.asking svg {
  width: 1rem;
  height: 1rem;
  color: var(--accent);
}

.asking span {
  flex: 1;
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
