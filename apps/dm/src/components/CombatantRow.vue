<script setup lang="ts">
import {
  adjustHp,
  CONDITIONS,
  type Combatant,
  initiativeDie,
  legendaryMax,
  parseHpChange,
  type ResolvedMonster,
  removeCombatant,
  renameCombatant,
  resolveConcentrationSave,
  rollInitiative,
  type Session,
  setConditionRounds,
  setInitiative,
  setLegendaryLeft,
  takesTurns,
  toggleConcentration,
  toggleCondition,
  toggleLair,
} from '@lorewarden/core';
import { Brain, Castle, Crown, Dices, Heart, Minus, Plus, Shield, Timer, X } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { conditionLabel, isDown } from '../lib/conditions';
import { parseInteger } from '../lib/numbers';
import MonsterDetails from './MonsterDetails.vue';

/**
 * One combatant in the initiative: initiative and name, hit points with the damage and heal
 * buttons, legendary actions, concentration and conditions with their rounds, and the stat block.
 */
const props = defineProps<{
  combatant: Combatant;
  /** True while it is the combatant's turn. */
  active: boolean;
  /** The stat block, for monsters and NPCs that have more than armor class and hit points. */
  monster?: ResolvedMonster | undefined;
  /**
   * Set after this combatant took damage, with the creatures that can take the same amount, e.g.
   * from a fireball.
   */
  splash?: { amount: number; targets: Combatant[] } | undefined;
}>();
const session = defineModel<Session>('session', { required: true });
const emit = defineEmits<{
  /** Damage or healing was applied; the amount is negative for damage. */
  hpChanged: [delta: number];
  splashTo: [combatantId: string, amount: number];
  splashDone: [];
}>();
const { t } = useI18n();
const { term, shareInitiativeRolls } = useSettings();

/** Amount typed for the damage and heal buttons. */
const amount = ref('');
const statsOpen = ref(false);
/** Condition whose duration is being typed. */
const editingRounds = ref<string>();
/** Focuses an input as soon as it appears. */
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
/** Concentration is offered in the condition list, where the game master looks for it. */
const CONCENTRATION = 'concentration';

const label = (condition: string) => conditionLabel(term, condition);

/** Shows how a rolled initiative came about, e.g. "d20: 14 + 2", or that a player sent it. */
function rollTitle(): string | undefined {
  const { combatant } = props;
  if (combatant.initiativeSource === 'player') return t('initiative.fromPhone');
  const die = initiativeDie(combatant);
  if (die === undefined) return undefined;
  const bonus = combatant.initiativeBonus ?? 0;
  return t('initiative.rolled', { die, bonus: bonus < 0 ? `− ${-bonus}` : `+ ${bonus}` });
}

function roll() {
  session.value = rollInitiative(session.value, {
    ids: [props.combatant.id],
    shareRolls: shareInitiativeRolls.value,
  });
}

function onInitiative(event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (!Number.isNaN(value)) session.value = setInitiative(session.value, props.combatant.id, value);
}

function onRename(event: Event) {
  const name = (event.target as HTMLInputElement).value;
  session.value = renameCombatant(session.value, props.combatant.id, name);
}

/** Applies the typed amount: the buttons force damage or healing, Enter follows the typed sign. */
function changeHp(sign?: 1 | -1) {
  const typed = parseHpChange(amount.value);
  if (typed === undefined) return;
  const delta = sign === undefined ? typed : sign * Math.abs(typed);
  session.value = adjustHp(session.value, props.combatant.id, delta);
  amount.value = '';
  emit('hpChanged', delta);
}

/** Clicking a full pip uses it and those after it; clicking an empty one gives them back. */
function onPip(pip: number) {
  const left = props.combatant.legendary?.left ?? 0;
  session.value = setLegendaryLeft(session.value, props.combatant.id, pip <= left ? pip - 1 : pip);
}

function pipLabel(pip: number): string {
  const left = props.combatant.legendary?.left ?? 0;
  return t('initiative.legendaryPip', { left: pip <= left ? pip - 1 : pip });
}

function saveRounds(condition: string, event: Event) {
  if (editingRounds.value !== condition) return;
  editingRounds.value = undefined;
  const value = parseInteger((event.target as HTMLInputElement).value);
  session.value = setConditionRounds(session.value, props.combatant.id, condition, value);
}

function onCondition(event: Event) {
  const select = event.target as HTMLSelectElement;
  const { id } = props.combatant;
  if (select.value === CONCENTRATION) session.value = toggleConcentration(session.value, id);
  else if (select.value) session.value = toggleCondition(session.value, id, select.value);
  select.value = '';
}
</script>

<template>
  <li
    class="combatant"
    :class="[combatant.kind, { active, down: isDown(combatant) }]"
    :aria-current="active ? 'step' : undefined"
  >
    <span v-if="!takesTurns(combatant)" class="init armor" :title="term('mechanics.ac')">
      <Shield aria-hidden="true" />{{ combatant.ac ?? '–' }}
    </span>
    <input
      v-else
      class="init"
      type="number"
      :value="combatant.initiative"
      :title="rollTitle()"
      :aria-label="t('initiative.initiativeOf', { name: combatant.name })"
      @change="onInitiative"
    />
    <input
      class="name"
      :value="combatant.name"
      :aria-label="t('initiative.name')"
      @change="onRename"
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
      <span v-if="combatant.kind === 'pc' && combatant.ac !== undefined" class="kind pc-ac">
        <Shield aria-hidden="true" />{{ term('statBlock.ac') }} {{ combatant.ac }}
      </span>
      <button
        v-if="combatant.kind !== 'pc' && takesTurns(combatant)"
        class="small ghost icon-only"
        :title="t('initiative.rollOneHint')"
        :aria-label="t('initiative.rollOne', { name: combatant.name })"
        @click="roll"
      >
        <Dices aria-hidden="true" />
      </button>
      <span v-if="combatant.hp" class="hp">
        <span class="hp-value" :title="term('initiative.hp')">
          <Heart aria-hidden="true" />{{ combatant.hp.current }}/{{ combatant.hp.max }}
        </span>
        <input
          v-model="amount"
          type="text"
          class="amount"
          :aria-label="t('initiative.amount')"
          :title="t('initiative.amountHint')"
          :placeholder="t('initiative.amountShort')"
          @keydown.enter.prevent="changeHp()"
        />
        <button
          class="small"
          :title="t('initiative.damage')"
          :aria-label="t('initiative.damage')"
          @click="changeHp(-1)"
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          class="small"
          :title="t('initiative.heal')"
          :aria-label="t('initiative.heal')"
          @click="changeHp(1)"
        >
          <Plus aria-hidden="true" />
        </button>
      </span>
      <span
        v-if="combatant.legendary"
        class="legendary"
        role="group"
        :aria-label="
          t('initiative.legendaryLeft', {
            actions: term('initiative.legendary'),
            left: combatant.legendary.left,
            max: legendaryMax(combatant),
          })
        "
      >
        <Crown aria-hidden="true" :title="term('initiative.legendary')" />
        <button
          v-for="pip in legendaryMax(combatant)"
          :key="pip"
          class="pip"
          :class="{ used: pip > combatant.legendary.left }"
          :aria-label="pipLabel(pip)"
          :title="pipLabel(pip)"
          @click="onPip(pip)"
        ></button>
        <button
          class="small ghost icon-only"
          :class="{ pressed: combatant.legendary.inLair }"
          :aria-pressed="combatant.legendary.inLair === true"
          :title="t('initiative.inLairHint')"
          :aria-label="t('initiative.inLair')"
          @click="session = toggleLair(session, combatant.id)"
        >
          <Castle aria-hidden="true" />
        </button>
      </span>
      <button
        v-if="combatant.concentrating"
        class="small tag concentration"
        :title="t('initiative.endConcentration')"
        @click="session = toggleConcentration(session, combatant.id)"
      >
        <Brain aria-hidden="true" />{{ term('initiative.concentration') }} ×
      </button>
      <span v-for="condition in combatant.conditions" :key="condition" class="tag condition">
        <button
          class="tag-part"
          :title="t('initiative.removeCondition')"
          @click="session = toggleCondition(session, combatant.id, condition)"
        >
          {{ label(condition) }} ×
        </button>
        <input
          v-if="editingRounds === condition"
          v-focus
          class="rounds-input"
          type="number"
          min="1"
          :value="combatant.conditionRounds?.[condition] ?? ''"
          :aria-label="t('initiative.roundsOf', { condition: label(condition) })"
          @keydown.enter.prevent="saveRounds(condition, $event)"
          @keydown.esc.prevent="editingRounds = undefined"
          @blur="saveRounds(condition, $event)"
        />
        <button
          v-else
          class="tag-part rounds"
          :title="t('initiative.roundsHint')"
          :aria-label="
            combatant.conditionRounds?.[condition]
              ? t('initiative.roundsLeft', { rounds: combatant.conditionRounds[condition] })
              : t('initiative.roundsOf', { condition: label(condition) })
          "
          @click="editingRounds = condition"
        >
          <Timer aria-hidden="true" />{{ combatant.conditionRounds?.[condition] ?? '' }}
        </button>
      </span>
      <button
        v-if="monster"
        class="small"
        :aria-expanded="statsOpen"
        @click="statsOpen = !statsOpen"
      >
        {{ t('statBlock.show') }}
      </button>
      <select
        v-if="takesTurns(combatant)"
        class="add-condition"
        :aria-label="t('initiative.addCondition')"
        @change="onCondition"
      >
        <option value="">{{ t('initiative.addCondition') }}</option>
        <option v-if="!combatant.concentrating" :value="CONCENTRATION">
          {{ term('initiative.concentration') }}
        </option>
        <option
          v-for="condition in CONDITIONS.filter((c) => !combatant.conditions.includes(c))"
          :key="condition"
          :value="condition"
        >
          {{ term(`conditions.${condition}`) }}
        </option>
      </select>
      <div v-if="combatant.concentrationSaves?.length" class="prompt" role="status">
        <Brain aria-hidden="true" />
        <span>
          {{ term('initiative.concentrationSave', { dc: combatant.concentrationSaves[0] }) }}
          <template v-if="combatant.concentrationSaves.length > 1">
            (+{{ combatant.concentrationSaves.length - 1 }})
          </template>
        </span>
        <button class="small" @click="session = resolveConcentrationSave(session, combatant.id, true)">
          {{ t('initiative.concentrationKept') }}
        </button>
        <button class="small" @click="session = resolveConcentrationSave(session, combatant.id, false)">
          {{ t('initiative.concentrationLost') }}
        </button>
      </div>
      <div v-if="splash && splash.targets.length > 0" class="prompt splash">
        <span>{{ t('initiative.splash', { amount: splash.amount }) }}</span>
        <span v-for="target in splash.targets" :key="target.id" class="split">
          <button class="small" @click="emit('splashTo', target.id, splash.amount)">
            {{ target.name }}
          </button>
          <button
            class="small"
            :title="t('initiative.splashHalfHint', { amount: Math.floor(splash.amount / 2) })"
            :aria-label="
              t('initiative.splashHalf', { name: target.name, amount: Math.floor(splash.amount / 2) })
            "
            @click="emit('splashTo', target.id, Math.floor(splash.amount / 2))"
          >
            ½
          </button>
        </span>
        <button
          class="small ghost icon-only"
          :title="t('initiative.splashDone')"
          :aria-label="t('initiative.splashDone')"
          @click="emit('splashDone')"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
    <MonsterDetails v-if="statsOpen && monster" class="stats" :monster="monster" />
  </li>
</template>

<style scoped>
.pc-ac {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.pc-ac svg {
  width: 0.8rem;
  height: 0.8rem;
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

.tag.condition {
  display: inline-flex;
  align-items: stretch;
  padding: 0;
  overflow: hidden;
}

.tag-part {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0.05rem 0.45rem;
  font-size: 0.75rem;
  min-height: 0;
}

.tag-part.rounds {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  border-left: 1px solid var(--border);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  padding-left: 0.3rem;
}

.tag-part svg,
.concentration svg {
  width: 0.75rem;
  height: 0.75rem;
}

.concentration {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.rounds-input {
  width: 3rem;
  padding: 0 0.25rem;
  font-size: 0.75rem;
  border: none;
  border-left: 1px solid var(--border);
  border-radius: 0;
}

.legendary {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.legendary > svg {
  width: 0.9rem;
  height: 0.9rem;
  color: var(--accent);
}

.pip {
  width: 0.85rem;
  height: 0.85rem;
  min-height: 0;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--accent);
}

.pip.used {
  background: transparent;
  border-color: var(--border-strong);
}

.pressed {
  color: var(--accent);
  background: var(--accent-soft);
}

.prompt {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  background: var(--accent-soft);
  font-size: 0.85rem;
}

.prompt > svg {
  width: 0.9rem;
  height: 0.9rem;
  color: var(--accent);
}

.split {
  display: inline-flex;
}

.split button:first-child {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.split button:last-child {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: none;
}

.add-condition {
  font-size: 0.8rem;
  padding: 0.1rem 0.3rem;
  color: var(--muted);
}
</style>
