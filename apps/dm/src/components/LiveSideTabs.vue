<script setup lang="ts">
import {
  type Adventure,
  addCombatants,
  cluesKnownBy,
  combatantsFromParty,
  type Npc,
  npcMonster,
  type Party,
  type Session,
  toggleClueFound,
} from '@lorewarden/core';
import { Dices, Lightbulb, ScrollText, Smartphone, Swords, Users } from '@lucide/vue';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import type { Table } from '../composables/useTable';
import { onlinePlayers } from '../lib/server';
import ImprovisePanel from './ImprovisePanel.vue';
import InitiativeTracker from './InitiativeTracker.vue';
import NpcCard from './NpcCard.vue';
import NpcClues from './NpcClues.vue';
import OtherNpcs from './OtherNpcs.vue';
import PartyPanel from './PartyPanel.vue';
import RandomTablesPanel from './RandomTablesPanel.vue';
import SessionLog from './SessionLog.vue';
import TablePanel from './TablePanel.vue';

/**
 * The side column of live mode. It shows one tool at a time next to the scene, so the scene text
 * and an NPC or the initiative can be read side by side without scrolling between them.
 */
export type SideTab = 'npcs' | 'open' | 'roll' | 'combat' | 'table' | 'log';

/** npcs: the NPCs of the current scene, whose cards come first. */
const props = defineProps<{
  adventure: Adventure;
  party: Party | undefined;
  table: Table;
  npcs: Npc[];
}>();
const session = defineModel<Session>('session', { required: true });
const tab = defineModel<SideTab>('tab', { default: 'npcs' });
const emit = defineEmits<{ addNpc: [npcId: string]; addEncounter: [encounterId: string] }>();
const { t } = useI18n();
const { trackPlayerHitPoints } = useSettings();

const tabs: SideTab[] = ['npcs', 'open', 'roll', 'combat', 'table', 'log'];
const icons = {
  npcs: Users,
  open: Lightbulb,
  roll: Dices,
  combat: Swords,
  table: Smartphone,
  log: ScrollText,
};
const tableOn = props.table.enabled;

// A running fight brings up the initiative; a new scene outside a fight brings up its NPCs.
watch(
  () => !!session.value.combat,
  (fighting, before) => {
    if (fighting && !before) tab.value = 'combat';
  },
  { immediate: true },
);
watch(
  () => session.value.currentSceneId,
  () => {
    if (!session.value.combat) tab.value = 'npcs';
  },
);

/** The clues each NPC in the scene knows, worked out once per change instead of on every render. */
const npcClues = computed(
  () => new Map(props.npcs.map((npc) => [npc.id, cluesKnownBy(props.adventure, npc.id)])),
);

/** Clues still to find anywhere, for the badge on the tab used to improvise. */
const openClueCount = computed(
  () =>
    props.adventure.clues.filter((clue) => !session.value.foundClueIds.includes(clue.id)).length,
);

function toggleClue(clueId: string) {
  session.value = toggleClueFound(session.value, clueId);
}

/** Puts the characters of the party into the initiative; players roll for themselves. */
function addParty() {
  if (!props.party) return;
  const characters = combatantsFromParty(props.party, session.value.initiative, {
    trackHitPoints: trackPlayerHitPoints.value,
  });
  session.value = addCombatants(session.value, characters);
  tab.value = 'combat';
}
</script>

<template>
  <aside class="side">
    <div class="tabs side-tabs" role="tablist" :aria-label="t('live.tools')">
      <button
        v-for="name in tabs"
        :id="`side-tab-${name}`"
        :key="name"
        role="tab"
        :title="t(`live.tabs.${name}`)"
        :aria-selected="tab === name"
        :aria-controls="`side-panel-${name}`"
        @click="tab = name"
      >
        <component :is="icons[name]" aria-hidden="true" />
        <span class="tab-label">{{ t(`live.tabs.${name}`) }}</span>
        <span v-if="name === 'npcs' && npcs.length > 0" class="count">{{ npcs.length }}</span>
        <span v-if="name === 'open' && openClueCount > 0" class="count">{{ openClueCount }}</span>
        <span v-if="name === 'combat' && session.combat" class="count">
          {{ t('live.roundShort', { round: session.combat.round }) }}
        </span>
      </button>
    </div>
    <!-- Hidden panels stay mounted so the tracker, the player list and the log keep their state. -->
    <div
      v-show="tab === 'npcs'"
      id="side-panel-npcs"
      class="stack"
      role="tabpanel"
      aria-labelledby="side-tab-npcs"
    >
      <NpcCard
        v-for="npc in npcs"
        :id="`npc-${npc.id}`"
        :key="npc.id"
        :npc="npc"
        :monster="npcMonster(adventure, npc)"
        tabindex="-1"
      >
        <template v-if="npcClues.get(npc.id)?.length" #clues>
          <NpcClues
            :clues="npcClues.get(npc.id) ?? []"
            :found-clue-ids="session.foundClueIds"
            @toggle="toggleClue"
          />
        </template>
        <button class="small" @click="emit('addNpc', npc.id)">
          {{ t('live.addToInitiative') }}
        </button>
      </NpcCard>
      <p v-if="npcs.length === 0" class="hint">{{ t('live.noNpcs') }}</p>
      <OtherNpcs
        :adventure="adventure"
        :found-clue-ids="session.foundClueIds"
        :current-scene-id="session.currentSceneId"
        @toggle="toggleClue"
        @add-npc="emit('addNpc', $event)"
      />
    </div>
    <div v-show="tab === 'open'" id="side-panel-open" role="tabpanel" aria-labelledby="side-tab-open">
      <ImprovisePanel
        :adventure="adventure"
        :found-clue-ids="session.foundClueIds"
        @toggle="toggleClue"
      />
    </div>
    <div v-show="tab === 'roll'" id="side-panel-roll" role="tabpanel" aria-labelledby="side-tab-roll">
      <RandomTablesPanel
        v-model:session="session"
        :adventure="adventure"
        @add-encounter="emit('addEncounter', $event)"
      />
    </div>
    <div
      v-show="tab === 'combat'"
      id="side-panel-combat"
      role="tabpanel"
      aria-labelledby="side-tab-combat"
    >
      <InitiativeTracker
        v-model:session="session"
        :adventure="adventure"
        :party="party"
        :players="tableOn ? onlinePlayers : []"
      />
    </div>
    <div
      v-show="tab === 'table'"
      id="side-panel-table"
      role="tabpanel"
      aria-labelledby="side-tab-table"
    >
      <!-- The players: the party's characters with their numbers, then the phones. -->
      <TablePanel :table="table" :adventure="adventure" :session="session" :party="party">
        <PartyPanel
          v-if="party"
          :party="party"
          :session="session"
          :players="tableOn ? onlinePlayers : []"
          headless
          @add-party="addParty"
        />
      </TablePanel>
    </div>
    <div v-show="tab === 'log'" id="side-panel-log" role="tabpanel" aria-labelledby="side-tab-log">
      <SessionLog v-model:session="session" :adventure-title="adventure.title" />
    </div>
  </aside>
</template>

<style scoped>
/* The tab labels fold away when the side column is narrow. */
.side {
  container: side / inline-size;
}

/* The tabs stay on top while a long panel scrolls. */
.side-tabs {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: 0.75rem;
  background: var(--bg);
  /* Short tabs fit side by side; wrap instead of a scrollbar where the column is too narrow. */
  flex-wrap: wrap;
  gap: 0;
}

.side-tabs button {
  padding-inline: 0.5rem;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.side-tabs svg {
  width: 1rem;
  height: 1rem;
}

/* In a narrow column only the open tab keeps its label; the others show their icon and count. */
@container side (max-width: 31rem) {
  .side-tabs button:not([aria-selected="true"]) .tab-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

@media (max-width: 480px) {
  .side-tabs button {
    padding-inline: 0.4rem;
  }
}

/*
 * On a desktop the side column scrolls on its own, so the tabs and the scrollbar never move.
 * Its parts keep their height instead of being squeezed.
 */
@media (min-width: 961px) {
  .side {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 1rem;
  }

  .side > * {
    flex-shrink: 0;
  }
}
</style>
