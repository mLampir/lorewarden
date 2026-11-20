<script setup lang="ts">
import {
  type Adventure,
  activeMechanics,
  addCombatants,
  adjustHp,
  askForInitiative,
  combatantsFromParty,
  endCombat,
  fireMechanics,
  legendaryMax,
  nextTurn,
  type Party,
  type Player,
  previousTurn,
  type ResolvedMonster,
  rollInitiative,
  type Session,
  setLegendaryLeft,
  startCombat,
  stopAskingForInitiative,
  takesTurns,
  toggleMechanic,
} from '@lorewarden/core';
import {
  Backpack,
  ChevronLeft,
  ChevronRight,
  Crown,
  Dices,
  Smartphone,
  Square,
  Swords,
  Timer,
  Zap,
} from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useSettings } from '../composables/useSettings';
import { conditionLabel, isDown } from '../lib/conditions';
import { triggerText } from '../lib/mechanics';
import { combatantMonster, hasMonsterDetails } from '../lib/monster';
import CombatantRow from './CombatantRow.vue';
import InitiativeAddForm from './InitiativeAddForm.vue';

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
    const resolved = combatantMonster(adventure, library.value, combatant);
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

function rollAll() {
  session.value = rollInitiative(session.value, {
    ids: rollable.value.map((c) => c.id),
    shareRolls: shareInitiativeRolls.value,
  });
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

/** Damage offers the same amount for more creatures; healing ends the offer. */
function onHpChanged(sourceId: string, delta: number) {
  splash.value = delta < 0 ? { sourceId, amount: -delta, done: [] } : undefined;
}

function splashTo(id: string, amount: number) {
  const current = splash.value;
  if (!current) return;
  session.value = adjustHp(session.value, id, -amount);
  current.done.push(id);
}

/** What the row of a combatant offers after it took damage. */
function splashOf(id: string) {
  const current = splash.value;
  return current?.sourceId === id
    ? { amount: current.amount, targets: splashTargets.value }
    : undefined;
}

/** Conditions whose duration ran out at the end of the last turn, as "Goblin 1: Frightened". */
const endedConditions = computed(() =>
  (session.value.combat?.ended ?? []).map(({ combatantId, condition }) => {
    const name = session.value.initiative.find((c) => c.id === combatantId)?.name ?? '?';
    return `${name}: ${conditionLabel(term, condition)}`;
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

function end() {
  if (window.confirm(t('initiative.endConfirm'))) session.value = endCombat(session.value);
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
            @click="rollAll"
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
      <CombatantRow
        v-for="combatant in session.initiative"
        :key="combatant.id"
        v-model:session="session"
        :combatant="combatant"
        :active="combatant.id === activeId"
        :monster="monsters.get(combatant.id)"
        :splash="splashOf(combatant.id)"
        @hp-changed="onHpChanged(combatant.id, $event)"
        @splash-to="splashTo"
        @splash-done="splash = undefined"
      />
    </ol>

    <button v-if="partyToAdd.length > 0" class="small add-party" @click="addParty">
      <Backpack aria-hidden="true" />{{ t('party.addToInitiative', { count: partyToAdd.length }) }}
    </button>
    <InitiativeAddForm v-model:session="session" />
  </section>
</template>

<style scoped>
.add-party {
  align-self: flex-start;
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
</style>
