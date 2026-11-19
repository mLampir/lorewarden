<script setup lang="ts">
import {
  type Asset,
  addCombatants,
  addLogNote,
  buildTermIndex,
  type Combatant,
  cluesToDiscover,
  combatantFromMonster,
  combatantFromNpc,
  combatantsFromEncounter,
  moveToScene,
  type ResolvedMonster,
  rollInitiative,
  toggleClueFound,
} from '@lorewarden/core';
import {
  ArrowRight,
  ChevronLeft,
  ChevronsUp,
  DoorOpen,
  Gem,
  Image,
  Map as MapIcon,
  Network,
  RotateCcw,
  Search,
  Swords,
} from '@lucide/vue';
import { computed, nextTick, provide, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdventureMissing from '../components/AdventureMissing.vue';
import ClueCheck from '../components/ClueCheck.vue';
import EncounterGenerator from '../components/EncounterGenerator.vue';
import FinishAdventure from '../components/FinishAdventure.vue';
import ItemCard from '../components/ItemCard.vue';
import LiveSideTabs, { type SideTab } from '../components/LiveSideTabs.vue';
import MapViewer from '../components/MapViewer.vue';
import NotesText from '../components/NotesText.vue';
import SceneEncounterCard from '../components/SceneEncounterCard.vue';
import SceneGlance from '../components/SceneGlance.vue';
import SceneGraph from '../components/SceneGraph.vue';
import ScenePuzzles from '../components/ScenePuzzles.vue';
import TermText from '../components/TermText.vue';
import { useAdventure } from '../composables/useAdventure';
import { useAdventureParty } from '../composables/useAdventureParty';
import { useLeaveGuard } from '../composables/useLeaveGuard';
import { useLiveSession } from '../composables/useLiveSession';
import { useQuickSearchPage } from '../composables/useQuickSearch';
import { useSettings } from '../composables/useSettings';
import { useTable } from '../composables/useTable';
import { termIndexKey } from '../lib/terms';

const props = defineProps<{ id: string }>();
const { t, d } = useI18n();
const { autoRollInitiative, shareInitiativeRolls, rollHitPoints } = useSettings();

const { adventure, loading, savePending, scenesById, npcsById, itemsById } = useAdventure(
  toRef(props, 'id'),
);
const { party } = useAdventureParty(adventure);

const {
  session,
  saveFailed,
  pending: sessionPending,
  unreadable: sessionUnreadable,
  restart,
} = useLiveSession(adventure);
useLeaveGuard(savePending, sessionPending);
const showGraph = ref(false);
const showSceneMap = ref(false);
// Folding stays the same from scene to scene, for game masters who prefer the short version.
const readAloudOpen = ref(true);
const notesOpen = ref(true);
// Rules terms and creature names in the adventure text show the rule or stat block on hover.
provide(
  termIndexKey,
  computed(() => (adventure.value ? buildTermIndex(adventure.value) : undefined)),
);
/** Puts together a fight on the spot when the players go somewhere unplanned. */
const showGenerator = ref(false);
const table = useTable(adventure, session, party);
const tableOn = table.enabled;
/** The tool shown in the side column. */
const sideTab = ref<SideTab>('npcs');

const scene = computed(() => {
  const id = session.value?.currentSceneId;
  return id ? scenesById.value.get(id) : undefined;
});

const sceneNpcs = computed(
  () => scene.value?.npcIds.flatMap((id) => npcsById.value.get(id) ?? []) ?? [],
);

// A new scene starts at its top; on a desktop the scene scrolls in its own area.
const scenePane = ref<HTMLElement>();
watch(
  () => session.value?.currentSceneId,
  () => scenePane.value?.scrollTo({ top: 0 }),
);

/** Opens an NPC's card in the side column, e.g. from the names at the top of the scene. */
async function showNpc(npcId: string) {
  sideTab.value = 'npcs';
  await nextTick();
  const card = document.getElementById(`npc-${npcId}`);
  card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  card?.focus({ preventScroll: true });
}
const sceneMaps = computed(() => {
  const ids = scene.value?.assetIds ?? [];
  return (adventure.value?.assets ?? []).filter(
    (asset) => asset.kind === 'map' && ids.includes(asset.id),
  );
});
const sceneHandouts = computed(() => {
  const ids = scene.value?.assetIds ?? [];
  return (adventure.value?.assets ?? []).filter(
    (asset) => asset.kind !== 'map' && ids.includes(asset.id),
  );
});
const shownHandout = ref<Asset>();

const sceneItems = computed(() =>
  scene.value?.itemIds.flatMap((id) => itemsById.value.get(id) ?? []),
);

/** What the party can come across in the scene itself; what NPCs know is on their cards. */
const sceneClues = computed(() => {
  const a = adventure.value;
  const id = scene.value?.id;
  return a && id ? cluesToDiscover(a, id) : [];
});

const scenePuzzles = computed(() => {
  const id = scene.value?.id;
  return id ? (adventure.value?.puzzles ?? []).filter((puzzle) => puzzle.sceneId === id) : [];
});

function isFound(clueId: string): boolean {
  return session.value?.foundClueIds.includes(clueId) ?? false;
}

function toggleClue(clueId: string) {
  if (session.value) session.value = toggleClueFound(session.value, clueId);
}

const sceneEncounters = computed(() => {
  const a = adventure.value;
  const s = scene.value;
  if (!a || !s) return [];
  return a.encounters.filter((e) => s.encounterIds.includes(e.id) || e.sceneId === s.id);
});

function goTo(sceneId: string) {
  const target = scenesById.value.get(sceneId);
  if (target && session.value) session.value = moveToScene(session.value, target);
}

function onJump(event: Event) {
  goTo((event.target as HTMLSelectElement).value);
}

/** Adds combatants; with automatic rolls on they roll initiative as they join. */
function joinCombat(combatants: Combatant[]) {
  if (!session.value) return;
  const added = addCombatants(session.value, combatants);
  sideTab.value = 'combat';
  session.value = autoRollInitiative.value
    ? rollInitiative(added, {
        ids: combatants.map((c) => c.id),
        shareRolls: shareInitiativeRolls.value,
        joinExistingRolls: true,
      })
    : added;
}

function addEncounter(encounterId: string) {
  if (!adventure.value) return;
  joinCombat(
    combatantsFromEncounter(adventure.value, encounterId, {
      rollHitPoints: rollHitPoints.value,
      existing: session.value?.initiative,
    }),
  );
}

function addNpc(npcId: string) {
  const npc = npcsById.value.get(npcId);
  if (npc) joinCombat([combatantFromNpc(npc, adventure.value)]);
}

/** Adds a single monster, e.g. one found with the quick search. */
function addMonster(monster: ResolvedMonster, ref: string) {
  joinCombat([combatantFromMonster(monster, { ref, existing: session.value?.initiative })]);
}

// The quick search jumps to scenes and puts NPCs and monsters into the initiative.
useQuickSearchPage({
  adventure,
  openScene: goTo,
  addNpcToInitiative: addNpc,
  addMonsterToInitiative: addMonster,
});

function handOut(name: string) {
  if (session.value) session.value = addLogNote(session.value, t('live.lootLog', { name }));
}

function newSession() {
  if (window.confirm(t('live.newSessionConfirm'))) restart();
}
</script>

<template>
  <main class="page live">
    <p v-if="loading || (adventure && !session)" class="muted">{{ t('common.loading') }}</p>
    <AdventureMissing v-else-if="!adventure || !session" :id="id" />
    <template v-else>
      <header class="page-header live-header">
        <div>
          <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }" class="back">
            <ChevronLeft aria-hidden="true" />{{ t('live.backToEditor') }}
          </RouterLink>
          <h1>{{ adventure.title }}</h1>
          <p class="meta">
            <span>{{ t('live.sessionStarted', { date: d(new Date(session.startedAt), 'short') }) }}</span>
            <span v-if="adventure.clues.length > 0" class="pill">
              <Search aria-hidden="true" />
              {{
                t('live.cluesFound', {
                  found: session.foundClueIds.length,
                  total: adventure.clues.length,
                })
              }}
            </span>
          </p>
          <p v-if="saveFailed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
          <p v-if="sessionUnreadable" class="error" role="alert">
            {{ t('live.sessionUnreadable') }}
          </p>
        </div>
        <div class="row">
          <label class="inline scene-picker">
            <MapIcon aria-hidden="true" />
            <span class="sr-only">{{ t('live.jumpTo') }}</span>
            <select :value="session.currentSceneId ?? ''" @change="onJump">
              <option value="" disabled>{{ t('live.chooseScene') }}</option>
              <option v-for="s in adventure.scenes" :key="s.id" :value="s.id">{{ s.title }}</option>
            </select>
          </label>
          <button :aria-pressed="showGraph" @click="showGraph = !showGraph">
            <Network aria-hidden="true" />{{ t('live.graph') }}
          </button>
          <button
            class="ghost icon-only"
            :title="t('live.newSession')"
            :aria-label="t('live.newSession')"
            @click="newSession"
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </header>

      <SceneGraph
        v-if="showGraph"
        class="graph"
        :adventure="adventure"
        :current-id="session.currentSceneId"
        :selected-id="session.currentSceneId"
        @select="goTo"
      />

      <div class="live-grid">
        <section ref="scenePane" class="stack scene">
          <details v-if="adventure.summary" class="card summary">
            <summary>{{ t('live.summary') }}</summary>
            <NotesText class="secret" :text="adventure.summary" />
          </details>

          <template v-if="scene">
            <div class="row scene-head">
              <h2 class="scene-title">{{ scene.title }}</h2>
              <button
                v-if="scene.battleMap || sceneMaps.length > 0"
                class="primary"
                @click="showSceneMap = true"
              >
                <MapIcon aria-hidden="true" />{{ t('live.sceneMap') }}
              </button>
            </div>
            <MapViewer
              v-if="showSceneMap"
              :battle-map="scene.battleMap"
              :images="sceneMaps"
              @close="showSceneMap = false"
            />
            <SceneGlance :scene="scene" :npcs="sceneNpcs" @show-npc="showNpc" />
            <details
              v-if="scene.description"
              class="fold"
              :open="readAloudOpen"
              @toggle="readAloudOpen = ($event.target as HTMLDetailsElement).open"
            >
              <summary class="fold-label">{{ t('live.readAloud') }}</summary>
              <blockquote class="read-aloud">
                <TermText :text="scene.description" />
                <button
                  v-if="tableOn"
                  class="small reveal-text"
                  @click="table.reveal({ kind: 'text', title: scene.title, text: scene.description })"
                >
                  {{ t('table.showToPlayers') }}
                </button>
              </blockquote>
            </details>
            <details
              v-if="scene.notes"
              class="fold"
              :open="notesOpen"
              @toggle="notesOpen = ($event.target as HTMLDetailsElement).open"
            >
              <summary class="fold-label only-you">{{ t('live.onlyForYou') }}</summary>
              <NotesText class="secret" :text="scene.notes" />
            </details>

            <div class="stack">
              <div class="row spread">
                <h3 class="section-title"><Swords aria-hidden="true" />{{ t('live.encounters') }}</h3>
                <button
                  class="small"
                  :aria-expanded="showGenerator"
                  @click="showGenerator = !showGenerator"
                >
                  {{ t('live.randomEncounter') }}
                </button>
              </div>
              <EncounterGenerator
                v-if="showGenerator && adventure"
                class="card"
                :adventure="adventure"
                :scene-id="scene.id"
                @added="showGenerator = false"
              />
              <SceneEncounterCard
                v-for="encounter in sceneEncounters"
                :key="encounter.id"
                :adventure="adventure"
                :encounter="encounter"
                @add="addEncounter(encounter.id)"
              />
            </div>

            <div v-if="sceneClues.length > 0" class="stack">
              <h3 class="section-title"><Search aria-hidden="true" />{{ t('live.discover') }}<span class="count">{{ sceneClues.filter((c) => isFound(c.clue.id)).length }}/{{ sceneClues.length }}</span></h3>
              <ul class="list stack">
                <li v-for="{ clue, leads } in sceneClues" :key="clue.id">
                  <ClueCheck
                    :clue="clue"
                    :leads="leads"
                    :found="isFound(clue.id)"
                    @toggle="toggleClue(clue.id)"
                  />
                </li>
              </ul>
            </div>

            <ScenePuzzles
              v-if="scenePuzzles.length > 0"
              v-model:session="session"
              :adventure="adventure"
              :puzzles="scenePuzzles"
              :table="table"
            />

            <div v-if="sceneHandouts.length > 0" class="stack">
              <h3 class="section-title"><Image aria-hidden="true" />{{ t('live.handouts') }}</h3>
              <div class="row handouts">
                <figure v-for="handout in sceneHandouts" :key="handout.id" class="handout">
                  <button
                    class="thumb-button"
                    :aria-label="t('live.showHandout', { title: handout.title })"
                    @click="shownHandout = handout"
                  >
                    <img :src="handout.src" :alt="handout.title" class="thumb" />
                  </button>
                  <figcaption>{{ handout.title }}</figcaption>
                  <button
                    v-if="tableOn"
                    class="small"
                    @click="table.reveal({ kind: 'asset', assetId: handout.id })"
                  >
                    {{ t('table.showToPlayers') }}
                  </button>
                </figure>
              </div>
              <MapViewer
                v-if="shownHandout"
                :images="[shownHandout]"
                @close="shownHandout = undefined"
              />
            </div>

            <div v-if="sceneItems && sceneItems.length > 0" class="stack">
              <h3 class="section-title"><Gem aria-hidden="true" />{{ t('live.loot') }}</h3>
              <div class="cards">
                <ItemCard v-for="item in sceneItems" :key="item.id" :item="item">
                  <button class="small" @click="handOut(item.name)">{{ t('live.handOut') }}</button>
                </ItemCard>
              </div>
            </div>
            <p v-if="scene.levelUp" class="level-up">
              <ChevronsUp aria-hidden="true" />{{ t('live.levelUp') }}
            </p>
            <div v-if="scene.exits.length > 0" class="stack exits">
              <h3 class="section-title"><DoorOpen aria-hidden="true" />{{ t('live.exits') }}</h3>
              <div class="row">
                <button
                  v-for="(exit, i) in scene.exits"
                  :key="i"
                  class="exit"
                  @click="goTo(exit.targetSceneId)"
                >
                  <span class="exit-label">{{ exit.label }}<ArrowRight aria-hidden="true" /></span>
                  <small v-if="exit.condition" class="muted">{{ exit.condition }}</small>
                </button>
              </div>
            </div>
            <p v-else class="hint">
              {{ scene.ending ? t('live.ending') : t('live.noExits') }}
            </p>
            <FinishAdventure
              v-if="scene.ending && party"
              :adventure="adventure"
              :session="session"
              :party="party"
            />
          </template>
          <p v-else class="muted">{{ t('live.noScene') }}</p>
        </section>

        <LiveSideTabs
          v-model:session="session"
          v-model:tab="sideTab"
          :adventure="adventure"
          :party="party"
          :table="table"
          :npcs="sceneNpcs"
          @add-npc="addNpc"
          @add-encounter="addEncounter"
        />
      </div>
    </template>
  </main>
</template>

<style scoped>
.graph {
  margin-bottom: 1rem;
}

.live {
  max-width: 90rem;
}

.summary summary {
  cursor: pointer;
  font-weight: 600;
}

.summary .secret {
  margin: 0.5rem 0 0;
}

.level-up {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
  font-weight: 600;
}

.level-up svg {
  flex: none;
  width: 1.2rem;
  height: 1.2rem;
  color: var(--accent);
}

.fold summary {
  cursor: pointer;
  margin-bottom: 0.35rem;
  width: fit-content;
}

.fold-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.fold .only-you {
  color: var(--secret);
}

.read-aloud .reveal-text {
  display: flex;
  margin-top: 0.6rem;
  font-family: "Inter Variable", system-ui, sans-serif;
  font-style: normal;
}

.handouts {
  align-items: flex-start;
}

.handout {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 9rem;
}

.handout figcaption {
  font-size: 0.875rem;
}

.thumb-button {
  padding: 0;
  border: none;
  background: none;
}

.thumb {
  display: block;
  width: 9rem;
  height: 6rem;
  object-fit: cover;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.live-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 30rem);
  gap: 1.25rem;
  align-items: start;
}

@media (max-width: 960px) {
  .live-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.scene-head {
  justify-content: space-between;
  align-items: center;
}

.scene-title {
  font-size: 1.6rem;
  margin: 0;
}

.read-aloud {
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  font-size: 1.15rem;
  line-height: 1.6;
}

.live-header {
  align-items: flex-end;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
}

.pill svg {
  width: 0.85rem;
  height: 0.85rem;
}

.scene-picker {
  position: relative;
}

.scene-picker svg {
  position: absolute;
  left: 0.6rem;
  width: 1rem;
  height: 1rem;
  color: var(--muted);
  pointer-events: none;
}

.scene-picker select {
  padding-left: 2rem;
  min-width: 14rem;
  font-weight: 500;
}

.fold .secret {
  margin: 0;
}

.scene {
  gap: 1.25rem;
}

.exit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.65rem 1rem;
  border-color: var(--accent);
  font-weight: 600;
  text-align: left;
}

.exit-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.exit:hover:not(:disabled) {
  background: var(--accent-soft);
}

.exit small {
  font-weight: 400;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
}

/*
 * On a desktop, live mode fills the window: the header stays, and the scene and the side column
 * below it each scroll on their own, so the tabs and the scrollbar never move. The side column
 * scrolls in LiveSideTabs.
 */
@media (min-width: 961px) {
  .live {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-bottom: 0.75rem;
  }

  .live-header {
    flex: none;
  }

  /* Over the full width while open; it takes at most half the window and scrolls inside. */
  .graph {
    flex: none;
    max-height: 45vh;
    overflow: auto;
  }

  .live-grid {
    flex: 1;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
  }

  .scene {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* The areas scroll instead of squeezing their parts, e.g. the scene graph. */
  .scene > * {
    flex-shrink: 0;
  }

  /* Room for focus rings and card shadows at the edges of the scrolling areas. */
  .scene {
    padding: 0.25rem 0.5rem 1rem 0.25rem;
  }
}
</style>
