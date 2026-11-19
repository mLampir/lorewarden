<script setup lang="ts">
import {
  type Adventure,
  activeMechanics,
  addCombatants,
  adjustHp,
  askForInitiative,
  CONDITIONS,
  type Combatant,
  combatantsFromParty,
  createCombatant,
  endCombat,
  fireMechanics,
  initiativeDie,
  legendaryMax,
  nextTurn,
  npcMonster,
  type Party,
  type Player,
  parseHpChange,
  previousTurn,
  type ResolvedMonster,
  removeCombatant,
  renameCombatant,
  resolveConcentrationSave,
  resolvePoolMonster,
  rollInitiative,
  type Session,
  setConditionRounds,
  setInitiative,
  setLegendaryLeft,
  startCombat,
  stopAskingForInitiative,
  takesTurns,
  toggleConcentration,
  toggleCondition,
  toggleLair,
  toggleMechanic,
} from '@lorewarden/core';
import {
  Backpack,
  Brain,
  Castle,
  ChevronLeft,
  ChevronRight,
  Crown,
  Dices,
  Heart,
  Minus,
  Plus,
  Shield,
  Smartphone,
  Square,
  Swords,
  Timer,
  X,
  Zap,
} from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useSettings } from '../composables/useSettings';
import { triggerText } from '../lib/mechanics';
import { hasMonsterDetails, monsterById } from '../lib/monster';
import { parseInteger } from '../lib/numbers';
import MonsterDetails from './MonsterDetails.vue';

const props = withDefaults(
  defineProps<{
    adventure?: Adventure;
    /** Players connected with the player app, who can send their initiative. */
    players?: Player[];
    /** The party the adventure is played with, for adding all characters at once. */
    party?: Party | undefined;
  }>(),
  { players: () => [] },
);
const session = defineModel<Session>('session', { required: true });
const { t } = useI18n();
const {
  term,
  autoRollInitiative,
  shareInitiativeRolls,
  askPlayersForInitiative,
  trackPlayerHitPoints,
} = useSettings();

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

const { monsters: library } = useMonsterLibrary();

/**
 * Stat block and attacks of monsters from an encounter, of NPCs who fight as one and of monsters
 * added on their own from the quick search.
 */
const monsters = computed(() => {
  const result = new Map<string, ResolvedMonster>();
  const adventure = props.adventure;
  if (!adventure) return result;
  for (const combatant of session.value.initiative) {
    const npc = combatant.kind === 'npc' && adventure.npcs.find((n) => n.id === combatant.ref);
    const pool =
      combatant.kind === 'monster' && adventure.monsterPool.find((m) => m.id === combatant.ref);
    const resolved = npc
      ? npcMonster(adventure, npc)
      : pool
        ? resolvePoolMonster(adventure, pool)
        : combatant.kind === 'monster'
          ? monsterById(adventure, library.value, combatant.ref)
          : undefined;
    if (resolved && hasMonsterDetails(resolved)) result.set(combatant.id, resolved);
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

/** At 0 hit points, or unconscious for a character whose hit points the players track. */
function isDown(combatant: Combatant): boolean {
  return combatant.hp?.current === 0 || combatant.conditions.includes('unconscious');
}

/** Characters of the party who are not in the list yet. */
const partyToAdd = computed(() =>
  props.party
    ? combatantsFromParty(props.party, session.value.initiative, {
        trackHitPoints: trackPlayerHitPoints.value,
      })
    : [],
);

function addParty() {
  session.value = addCombatants(session.value, partyToAdd.value);
}

/**
 * The last damage dealt, so the same amount can go to more creatures, e.g. for a fireball.
 * `done` holds the creatures that have taken it.
 */
const splash = ref<{ sourceId: string; amount: number; done: string[] }>();

/** Creatures that can take the last damage too: others with hit points left. */
const splashTargets = computed(() => {
  const current = splash.value;
  if (!current) return [];
  return session.value.initiative.filter(
    (c) =>
      c.id !== current.sourceId &&
      !current.done.includes(c.id) &&
      c.hp !== undefined &&
      c.hp.current > 0,
  );
});

// The offer ends with the turn or the fight.
watch(
  () => `${session.value.combat?.round}:${session.value.combat?.turn}`,
  () => {
    splash.value = undefined;
  },
);

function splashTo(id: string, amount: number) {
  const current = splash.value;
  if (!current) return;
  session.value = adjustHp(session.value, id, -amount);
  current.done.push(id);
}

/** Applies the typed amount: the buttons force damage or healing, Enter follows the typed sign. */
function changeHp(id: string, sign?: 1 | -1) {
  const typed = parseHpChange(amounts[id] ?? '');
  if (typed === undefined) return;
  const delta = sign === undefined ? typed : sign * Math.abs(typed);
  session.value = adjustHp(session.value, id, delta);
  amounts[id] = undefined;
  splash.value = delta < 0 ? { sourceId: id, amount: -delta, done: [] } : undefined;
}

/** Condition whose duration is being typed, as "combatant id:condition". */
const editingRounds = ref<string>();
/** Focuses an input as soon as it appears. */
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

function saveRounds(id: string, condition: string, event: Event) {
  if (editingRounds.value !== `${id}:${condition}`) return;
  editingRounds.value = undefined;
  const value = parseInteger((event.target as HTMLInputElement).value);
  session.value = setConditionRounds(session.value, id, condition, value);
}

/** Conditions whose duration ran out at the end of the last turn, as "Goblin 1: Frightened". */
const endedConditions = computed(() =>
  (session.value.combat?.ended ?? []).map(({ combatantId, condition }) => {
    const name = session.value.initiative.find((c) => c.id === combatantId)?.name ?? '?';
    return `${name}: ${conditionLabel(condition)}`;
  }),
);

/** Legendary creatures that can still act after the current turn. */
const legendaryReady = computed(() =>
  session.value.combat
    ? session.value.initiative.filter(
        (c) => c.legendary && c.legendary.left > 0 && c.id !== activeId.value && !isDown(c),
      )
    : [],
);

/** Clicking a full pip uses it and those after it; clicking an empty one gives them back. */
function onPip(combatant: Combatant, pip: number) {
  const left = combatant.legendary?.left ?? 0;
  session.value = setLegendaryLeft(session.value, combatant.id, pip <= left ? pip - 1 : pip);
}

function onInitiative(id: string, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (!Number.isNaN(value)) session.value = setInitiative(session.value, id, value);
}

function onRename(id: string, event: Event) {
  session.value = renameCombatant(session.value, id, (event.target as HTMLInputElement).value);
}

/** Concentration is offered in the condition list, where the game master looks for it. */
const CONCENTRATION = 'concentration';

function onCondition(id: string, event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value === CONCENTRATION) session.value = toggleConcentration(session.value, id);
  else if (select.value) session.value = toggleCondition(session.value, id, select.value);
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

    <div v-if="endedConditions.length > 0" class="asking" role="status">
      <Timer aria-hidden="true" />
      <span>{{ t('initiative.conditionsEnded', { list: endedConditions.join(', ') }) }}</span>
    </div>

    <div v-for="boss in legendaryReady" :key="boss.id" class="asking" role="status">
      <Crown aria-hidden="true" />
      <span>
        {{
          t('initiative.legendaryReady', {
            name: boss.name,
            actions: term('initiative.legendary'),
            left: boss.legendary?.left,
            max: legendaryMax(boss),
          })
        }}
      </span>
      <button
        class="small"
        @click="session = setLegendaryLeft(session, boss.id, (boss.legendary?.left ?? 1) - 1)"
      >
        {{ t('initiative.useLegendary') }}
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
        :class="[combatant.kind, { active: combatant.id === activeId, down: isDown(combatant) }]"
        :aria-current="combatant.id === activeId ? 'step' : undefined"
      >
        <span
          v-if="!takesTurns(combatant)"
          class="init armor"
          :title="term('mechanics.ac')"
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
          <span v-if="combatant.kind === 'pc' && combatant.ac !== undefined" class="kind pc-ac">
            <Shield aria-hidden="true" />{{ term('statBlock.ac') }} {{ combatant.ac }}
          </span>
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
              :aria-label="t('initiative.legendaryPip', { left: pip <= combatant.legendary.left ? pip - 1 : pip })"
              :title="t('initiative.legendaryPip', { left: pip <= combatant.legendary.left ? pip - 1 : pip })"
              @click="onPip(combatant, pip)"
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
              {{ conditionLabel(condition) }} ×
            </button>
            <input
              v-if="editingRounds === `${combatant.id}:${condition}`"
              v-focus
              class="rounds-input"
              type="number"
              min="1"
              :value="combatant.conditionRounds?.[condition] ?? ''"
              :aria-label="t('initiative.roundsOf', { condition: conditionLabel(condition) })"
              @keydown.enter.prevent="saveRounds(combatant.id, condition, $event)"
              @keydown.esc.prevent="editingRounds = undefined"
              @blur="saveRounds(combatant.id, condition, $event)"
            />
            <button
              v-else
              class="tag-part rounds"
              :title="t('initiative.roundsHint')"
              :aria-label="
                combatant.conditionRounds?.[condition]
                  ? t('initiative.roundsLeft', { rounds: combatant.conditionRounds[condition] })
                  : t('initiative.roundsOf', { condition: conditionLabel(condition) })
              "
              @click="editingRounds = `${combatant.id}:${condition}`"
            >
              <Timer aria-hidden="true" />{{ combatant.conditionRounds?.[condition] ?? '' }}
            </button>
          </span>
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
          <div
            v-if="splash?.sourceId === combatant.id && splashTargets.length > 0"
            class="prompt splash"
          >
            <span>{{ t('initiative.splash', { amount: splash.amount }) }}</span>
            <span v-for="target in splashTargets" :key="target.id" class="split">
              <button class="small" @click="splashTo(target.id, splash.amount)">
                {{ target.name }}
              </button>
              <button
                class="small"
                :title="t('initiative.splashHalfHint', { amount: Math.floor(splash.amount / 2) })"
                :aria-label="
                  t('initiative.splashHalf', { name: target.name, amount: Math.floor(splash.amount / 2) })
                "
                @click="splashTo(target.id, Math.floor(splash.amount / 2))"
              >
                ½
              </button>
            </span>
            <button
              class="small ghost icon-only"
              :title="t('initiative.splashDone')"
              :aria-label="t('initiative.splashDone')"
              @click="splash = undefined"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
        <MonsterDetails
          v-if="openStats.has(combatant.id) && monsters.has(combatant.id)"
          class="stats"
          :monster="monsters.get(combatant.id) as ResolvedMonster"
        />
      </li>
    </ol>

    <button v-if="partyToAdd.length > 0" class="small add-party" @click="addParty">
      <Backpack aria-hidden="true" />{{ t('party.addToInitiative', { count: partyToAdd.length }) }}
    </button>
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
        @input="setDraftHp(($event.target as HTMLInputElement).value)"
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
.add-party {
  align-self: flex-start;
}

.pc-ac {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.pc-ac svg {
  width: 0.8rem;
  height: 0.8rem;
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
