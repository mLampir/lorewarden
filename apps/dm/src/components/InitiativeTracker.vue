<script setup lang="ts">
import {
  type Adventure,
  activeMechanics,
  addCombatants,
  adjustHp,
  askForInitiative,
  CONDITIONS,
  type Combatant,
  createCombatant,
  endCombat,
  fireMechanics,
  initiativeDie,
  nextTurn,
  type Player,
  parseHpChange,
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
  takesTurns,
  toggleCondition,
  toggleMechanic,
} from '@lorewarden/core';
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  Heart,
  Minus,
  Plus,
  Shield,
  Smartphone,
  Square,
  Swords,
  X,
  Zap,
} from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { triggerText } from '../lib/mechanics';
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
const amounts = reactive<Record<string, string | undefined>>({});
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

// Marks mechanics whose trigger now holds, whatever changed the session: a turn, damage, a removal.
watch(
  () => [session.value, props.adventure] as const,
  ([current, adventure]) => {
    if (!adventure) return;
    const fired = fireMechanics(adventure, current);
    if (fired !== current) session.value = fired;
  },
  { immediate: true },
);

/** Mechanics of the encounters in the fight; the ones whose trigger fired are highlighted. */
const mechanics = computed(() => {
  const adventure = props.adventure;
  if (!adventure) return [];
  return activeMechanics(adventure, session.value).map(({ encounter, mechanic, fired }) => ({
    mechanic,
    fired,
    when: triggerText(t, adventure, encounter, mechanic),
  }));
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
  session.value.initiative.filter(
    (c) => c.kind !== 'pc' && takesTurns(c) && c.initiativeSource !== 'typed',
  ),
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

/** Applies the typed amount: the buttons force damage or healing, Enter follows the typed sign. */
function changeHp(id: string, sign?: 1 | -1) {
  const delta = parseHpChange(amounts[id] ?? '');
  if (delta === undefined) return;
  session.value = adjustHp(session.value, id, sign === undefined ? delta : sign * Math.abs(delta));
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

    <div v-if="mechanics.length > 0" class="stack" aria-live="polite">
      <h3 class="section-title"><Zap aria-hidden="true" />{{ t('mechanics.heading') }}</h3>
      <ul class="list mechanics">
        <li v-for="{ mechanic, fired, when } in mechanics" :key="mechanic.id" :class="{ fired }">
          <div class="row when">
            <span>{{ when }}</span>
            <span v-if="fired" class="fired-tag">{{ t('mechanics.fired') }}</span>
            <button
              v-if="mechanic.trigger === 'manual'"
              class="small"
              @click="session = toggleMechanic(session, mechanic.id)"
            >
              {{ fired ? t('mechanics.undo') : t('mechanics.fire') }}
            </button>
          </div>
          <p class="secret">{{ mechanic.text }}</p>
        </li>
      </ul>
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
        <span
          v-if="!takesTurns(combatant)"
          class="init armor"
          :title="t('mechanics.ac')"
        >
          <Shield aria-hidden="true" />{{ combatant.ac ?? '–' }}
        </span>
        <input
          v-else
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
          <p v-if="combatant.description" class="description">{{ combatant.description }}</p>
          <span class="kind">{{ t(`initiative.kinds.${combatant.kind}`) }}</span>
          <button
            v-if="combatant.kind !== 'pc' && takesTurns(combatant)"
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
              v-model="amounts[combatant.id]"
              type="text"
              class="amount"
              :aria-label="t('initiative.amount')"
              :title="t('initiative.amountHint')"
              :placeholder="t('initiative.amountShort')"
              @keydown.enter.prevent="changeHp(combatant.id)"
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
            v-if="takesTurns(combatant)"
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

.combatant.object {
  border-left-color: var(--border-strong);
}

.armor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  font-size: 1rem;
}

.armor svg {
  width: 0.9rem;
  height: 0.9rem;
  color: var(--muted);
}

.mechanics {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mechanics li {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
}

.mechanics li.fired {
  color: var(--text);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.mechanics .when {
  font-size: 0.85rem;
  font-weight: 600;
}

.fired-tag {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.75rem;
}

.mechanics .secret {
  margin: 0.2rem 0 0;
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

.description {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.85rem;
  font-style: italic;
  color: var(--muted);
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
