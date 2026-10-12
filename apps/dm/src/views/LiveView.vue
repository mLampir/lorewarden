<script setup lang="ts">
import {
  type Asset,
  addCombatants,
  addLogNote,
  buildTermIndex,
  type Combatant,
  cluesKnownBy,
  cluesToDiscover,
  combatantFromNpc,
  combatantsFromEncounter,
  moveToScene,
  type ResolvedMonster,
  resolvePoolMonster,
  rollInitiative,
  type Session,
  startSession,
  toggleClueFound,
} from '@lorewarden/core';
import {
  ArrowRight,
  ChevronLeft,
  DoorOpen,
  Gem,
  Image,
  Lightbulb,
  Map as MapIcon,
  Network,
  RotateCcw,
  ScrollText,
  Search,
  Shield,
  Signpost,
  Smartphone,
  Swords,
  Target,
  Users,
  Zap,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ClueCheck from '../components/ClueCheck.vue';
import EncounterGenerator from '../components/EncounterGenerator.vue';
import ImprovisePanel from '../components/ImprovisePanel.vue';
import InitiativeTracker from '../components/InitiativeTracker.vue';
import ItemCard from '../components/ItemCard.vue';
import MapViewer from '../components/MapViewer.vue';
import MonsterDetails from '../components/MonsterDetails.vue';
import NotesText from '../components/NotesText.vue';
import NpcCard from '../components/NpcCard.vue';
import NpcClues from '../components/NpcClues.vue';
import OtherNpcs from '../components/OtherNpcs.vue';
import SceneGraph from '../components/SceneGraph.vue';
import ScenePuzzles from '../components/ScenePuzzles.vue';
import SessionLog from '../components/SessionLog.vue';
import TablePanel from '../components/TablePanel.vue';
import TermText from '../components/TermText.vue';
import { useAdventure } from '../composables/useAdventure';
import { useAutosave } from '../composables/useAutosave';
import { useSettings } from '../composables/useSettings';
import { useTable } from '../composables/useTable';
import { triggerText } from '../lib/mechanics';
import { hasMonsterDetails } from '../lib/monster';
import { onlinePlayers } from '../lib/server';
import { termIndexKey } from '../lib/terms';
import { getLatestSession, saveSession } from '../storage/database';

const props = defineProps<{ id: string }>();
const { t, d } = useI18n();
const route = useRoute();
const router = useRouter();
const { term, autoRollInitiative, shareInitiativeRolls, rollHitPoints } = useSettings();

const { adventure, loading, scenesById, npcsById, itemsById } = useAdventure(toRef(props, 'id'));

const session = ref<Session>();
const { failed: saveFailed, markSaved } = useAutosave(session, saveSession);
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
const table = useTable(adventure, session);
const tableOn = table.enabled;

// Continue the latest session of this adventure, or start the first one. The prep sheet opens
// live mode with ?session=new to start afresh; the query is dropped so a reload continues.
watch(adventure, async (value) => {
  if (!value || session.value?.adventureId === value.id) return;
  const latest = await getLatestSession(value.id).catch(() => undefined);
  markSaved(latest);
  const fresh = route.query.session === 'new';
  session.value = latest && !fresh ? latest : startSession(value, latest);
  if (fresh) void router.replace({ query: {} });
});

const scene = computed(() => {
  const id = session.value?.currentSceneId;
  return id ? scenesById.value.get(id) : undefined;
});

/** Purpose, features and way out, shown first so the scene is recalled in seconds. */
const sceneFeatures = computed(() => scene.value?.features.filter((f) => f.trim() !== '') ?? []);
const hasGlance = computed(
  () =>
    !!scene.value &&
    (!!scene.value.purpose ||
      !!scene.value.wayOut ||
      sceneFeatures.value.length > 0 ||
      sceneNpcs.value.length > 0),
);

const sceneNpcs = computed(
  () => scene.value?.npcIds.flatMap((id) => npcsById.value.get(id) ?? []) ?? [],
);

/**
 * The side column shows one tool at a time next to the scene, so the scene text and an NPC or the
 * initiative can be read side by side without scrolling between them.
 */
type SideTab = 'npcs' | 'open' | 'combat' | 'table' | 'log';
const sideTabs: SideTab[] = ['npcs', 'open', 'combat', 'table', 'log'];
const sideTabIcons = {
  npcs: Users,
  open: Lightbulb,
  combat: Swords,
  table: Smartphone,
  log: ScrollText,
};
const sideTab = ref<SideTab>('npcs');

// A running fight brings up the initiative; a new scene outside a fight brings up its NPCs.
watch(
  () => !!session.value?.combat,
  (fighting, before) => {
    if (fighting && !before) sideTab.value = 'combat';
  },
  { immediate: true },
);
watch(
  () => scene.value?.id,
  () => {
    if (!session.value?.combat) sideTab.value = 'npcs';
  },
);

/**
 * The side column ends at the bottom of the window wherever it starts, so its scrollbar is fully
 * in view also before the page is scrolled down to the scene.
 */
const side = ref<HTMLElement>();
let fitting = 0;
function fitSide() {
  cancelAnimationFrame(fitting);
  fitting = requestAnimationFrame(() => {
    const el = side.value;
    if (!el) return;
    const style = getComputedStyle(el);
    if (style.position !== 'sticky') {
      el.style.removeProperty('max-height');
      return;
    }
    const top = Math.max(el.getBoundingClientRect().top, Number.parseFloat(style.top) || 0);
    const gap = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    // It ends with the scene next to it, so it stays in place up to the end of the page.
    const sceneBottom = el.previousElementSibling?.getBoundingClientRect().bottom ?? Infinity;
    const bottom = Math.min(window.innerHeight - gap, sceneBottom);
    el.style.maxHeight = `${Math.max(bottom - top, 200)}px`;
  });
}
onMounted(() => {
  window.addEventListener('scroll', fitSide, { passive: true });
  window.addEventListener('resize', fitSide);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', fitSide);
  window.removeEventListener('resize', fitSide);
  cancelAnimationFrame(fitting);
});
watch([side, () => session.value?.currentSceneId], () => void nextTick(fitSide));
// The scene grows and shrinks as parts of it are folded open.
let sceneSize: ResizeObserver | undefined;
watch(side, (el) => {
  sceneSize?.disconnect();
  const scene = el?.previousElementSibling;
  if (!scene) return;
  sceneSize = new ResizeObserver(fitSide);
  sceneSize.observe(scene);
});
onBeforeUnmount(() => sceneSize?.disconnect());

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

function npcClues(npcId: string) {
  return adventure.value ? cluesKnownBy(adventure.value, npcId) : [];
}

const scenePuzzles = computed(() => {
  const id = scene.value?.id;
  return id ? (adventure.value?.puzzles ?? []).filter((puzzle) => puzzle.sceneId === id) : [];
});

function isFound(clueId: string): boolean {
  return session.value?.foundClueIds.includes(clueId) ?? false;
}

/** Clues still to find anywhere, for the badge on the tab used to improvise. */
const openClueCount = computed(
  () =>
    adventure.value?.clues.filter((clue) => !session.value?.foundClueIds.includes(clue.id))
      .length ?? 0,
);

function toggleClue(clueId: string) {
  if (session.value) session.value = toggleClueFound(session.value, clueId);
}

const sceneEncounters = computed(() => {
  const a = adventure.value;
  const s = scene.value;
  if (!a || !s) return [];
  return a.encounters
    .filter((e) => s.encounterIds.includes(e.id) || e.sceneId === s.id)
    .map((encounter) => ({
      id: encounter.id,
      difficulty: encounter.difficulty,
      monsters: encounter.monsters.map((entry, index) => {
        const pool = a.monsterPool.find((m) => m.id === entry.poolMonsterId);
        const resolved = pool ? resolvePoolMonster(a, pool) : undefined;
        return {
          key: `${entry.poolMonsterId}-${index}`,
          count: entry.count,
          name: entry.name ?? resolved?.name ?? entry.poolMonsterId,
          // The kind of creature, when the encounter gives these monsters their own name.
          kind: entry.name ? resolved?.name : undefined,
          description: entry.description,
          resolved: resolved && { ...resolved, hp: entry.hp ?? resolved.hp },
        };
      }),
      objects: encounter.objects,
      mechanics: encounter.mechanics.map((mechanic) => ({
        id: mechanic.id,
        when: triggerText(t, a, encounter, mechanic),
        text: mechanic.text,
      })),
    }));
});

/** Armor class and hit points at a glance, before the full stat block is opened. */
function quickStats(monster: ResolvedMonster): string {
  return [
    monster.ac !== undefined ? `${term('statBlock.ac')} ${monster.ac}` : '',
    monster.hp !== undefined ? `${term('statBlock.hp')} ${monster.hp}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

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
    combatantsFromEncounter(adventure.value, encounterId, { rollHitPoints: rollHitPoints.value }),
  );
}

function addNpc(npcId: string) {
  const npc = npcsById.value.get(npcId);
  if (npc) joinCombat([combatantFromNpc(npc)]);
}

function handOut(name: string) {
  if (session.value) session.value = addLogNote(session.value, t('live.lootLog', { name }));
}

function newSession() {
  if (!adventure.value || !window.confirm(t('live.newSessionConfirm'))) return;
  session.value = startSession(adventure.value, session.value);
}
</script>

<template>
  <main class="page live">
    <p v-if="loading || (adventure && !session)" class="muted">{{ t('common.loading') }}</p>
    <div v-else-if="!adventure || !session" class="stack">
      <p>{{ t('common.notFound') }}</p>
      <RouterLink to="/">{{ t('common.backToLibrary') }}</RouterLink>
    </div>
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

      <details v-if="adventure.summary" class="card summary">
        <summary>{{ t('live.summary') }}</summary>
        <NotesText class="secret" :text="adventure.summary" />
      </details>

      <SceneGraph
        v-if="showGraph"
        class="graph"
        :adventure="adventure"
        :current-id="session.currentSceneId"
        :selected-id="session.currentSceneId"
        @select="goTo"
      />

      <div class="live-grid">
        <section class="stack scene">
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
            <div v-if="hasGlance" class="glance">
              <p v-if="scene.purpose" class="glance-line">
                <Target aria-hidden="true" />
                <span>
                  <span class="glance-label">{{ t('live.purpose') }}</span>
                  <TermText :text="scene.purpose" />
                </span>
              </p>
              <ul v-if="sceneFeatures.length > 0" class="glance-features" :aria-label="t('live.features')">
                <li v-for="(feature, i) in sceneFeatures" :key="i" class="pill">
                  <TermText :text="feature" />
                </li>
              </ul>
              <p v-if="sceneNpcs.length > 0" class="glance-line">
                <Users aria-hidden="true" />
                <span class="here">
                  <span class="glance-label">{{ t('live.here') }}</span>
                  <button
                    v-for="npc in sceneNpcs"
                    :key="npc.id"
                    class="small"
                    :aria-label="t('live.showNpc', { name: npc.name })"
                    @click="showNpc(npc.id)"
                  >
                    {{ npc.name }}
                  </button>
                </span>
              </p>
              <p v-if="scene.wayOut" class="glance-line">
                <Signpost aria-hidden="true" />
                <span>
                  <span class="glance-label">{{ t('live.wayOut') }}</span>
                  <TermText :text="scene.wayOut" />
                </span>
              </p>
            </div>
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
              <article v-for="encounter in sceneEncounters" :key="encounter.id" class="card entity">
                <ul class="list stack">
                  <li v-for="monster in encounter.monsters" :key="monster.key">
                    <strong v-if="!monster.resolved">{{ monster.count }}× {{ monster.name }}</strong>
                    <details v-else-if="hasMonsterDetails(monster.resolved)" class="monster">
                      <summary>
                        <strong>{{ monster.count }}× {{ monster.name }}</strong>
                        <span v-if="monster.kind" class="muted quick">({{ monster.kind }})</span>
                        <span class="muted quick">{{ quickStats(monster.resolved) }}</span>
                        <span class="show">{{ t('statBlock.show') }}</span>
                        <span v-if="monster.description" class="description">
                          {{ monster.description }}
                        </span>
                        <NotesText
                          v-if="monster.resolved.notes"
                          class="muted notes"
                          :text="monster.resolved.notes"
                        />
                      </summary>
                      <MonsterDetails :monster="monster.resolved" />
                    </details>
                    <template v-else>
                      <strong>{{ monster.count }}× {{ monster.name }}</strong>
                      <span v-if="monster.kind" class="muted quick">({{ monster.kind }})</span>
                      <span class="muted quick">{{ quickStats(monster.resolved) }}</span>
                      <span v-if="monster.description" class="description">
                        {{ monster.description }}
                      </span>
                      <NotesText
                        v-if="monster.resolved.notes"
                        class="muted notes"
                        :text="monster.resolved.notes"
                      />
                    </template>
                  </li>
                  <li v-for="object in encounter.objects" :key="object.id">
                    <strong class="inline"><Shield aria-hidden="true" />{{ object.name }}</strong>
                    <span class="muted quick">
                      <template v-if="object.ac !== undefined">
                        {{ term('statBlock.ac') }} {{ object.ac }} ·
                      </template>
                      {{ term('statBlock.hp') }} {{ object.hp }}
                    </span>
                    <span v-if="object.description" class="description">
                      {{ object.description }}
                    </span>
                  </li>
                </ul>
                <div v-if="encounter.mechanics.length > 0" class="secret">
                  <span class="secret-label inline">
                    <Zap aria-hidden="true" />{{ t('mechanics.heading') }}
                  </span>
                  <ul class="list mechanics">
                    <li v-for="mechanic in encounter.mechanics" :key="mechanic.id">
                      <strong>{{ mechanic.when }}:</strong> <TermText :text="mechanic.text" />
                    </li>
                  </ul>
                </div>
                <p v-if="encounter.difficulty" class="hint">
                  {{ t('live.difficulty', { difficulty: encounter.difficulty }) }}
                </p>
                <div class="row actions">
                  <button class="small" @click="addEncounter(encounter.id)">
                    {{ t('live.addToInitiative') }}
                  </button>
                </div>
              </article>
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
          </template>
          <p v-else class="muted">{{ t('live.noScene') }}</p>
        </section>

        <aside ref="side" class="side">
          <div class="tabs side-tabs" role="tablist" :aria-label="t('live.tools')">
            <button
              v-for="name in sideTabs"
              :id="`side-tab-${name}`"
              :key="name"
              role="tab"
              :aria-selected="sideTab === name"
              :aria-controls="`side-panel-${name}`"
              @click="sideTab = name"
            >
              <component :is="sideTabIcons[name]" aria-hidden="true" />
              {{ t(`live.tabs.${name}`) }}
              <span v-if="name === 'npcs' && sceneNpcs.length > 0" class="count">
                {{ sceneNpcs.length }}
              </span>
              <span v-if="name === 'open' && openClueCount > 0" class="count">
                {{ openClueCount }}
              </span>
              <span v-if="name === 'combat' && session.combat" class="count">
                {{ t('live.roundShort', { round: session.combat.round }) }}
              </span>
            </button>
          </div>
          <!-- Hidden panels stay mounted so the tracker, the player list and the log keep their state. -->
          <div
            v-show="sideTab === 'npcs'"
            id="side-panel-npcs"
            class="stack"
            role="tabpanel"
            aria-labelledby="side-tab-npcs"
          >
            <NpcCard
              v-for="npc in sceneNpcs"
              :id="`npc-${npc.id}`"
              :key="npc.id"
              :npc="npc"
              tabindex="-1"
            >
              <template v-if="npcClues(npc.id).length > 0" #clues>
                <NpcClues
                  :clues="npcClues(npc.id)"
                  :found-clue-ids="session.foundClueIds"
                  @toggle="toggleClue"
                />
              </template>
              <button class="small" @click="addNpc(npc.id)">
                {{ t('live.addToInitiative') }}
              </button>
            </NpcCard>
            <p v-if="sceneNpcs.length === 0" class="hint">{{ t('live.noNpcs') }}</p>
            <OtherNpcs
              :adventure="adventure"
              :found-clue-ids="session.foundClueIds"
              :current-scene-id="session.currentSceneId"
              @toggle="toggleClue"
              @add-npc="addNpc"
            />
          </div>
          <div
            v-show="sideTab === 'open'"
            id="side-panel-open"
            role="tabpanel"
            aria-labelledby="side-tab-open"
          >
            <ImprovisePanel
              :adventure="adventure"
              :found-clue-ids="session.foundClueIds"
              @toggle="toggleClue"
            />
          </div>
          <div
            v-show="sideTab === 'combat'"
            id="side-panel-combat"
            role="tabpanel"
            aria-labelledby="side-tab-combat"
          >
            <InitiativeTracker
              v-model:session="session"
              :adventure="adventure"
              :players="tableOn ? onlinePlayers : []"
            />
          </div>
          <div
            v-show="sideTab === 'table'"
            id="side-panel-table"
            role="tabpanel"
            aria-labelledby="side-tab-table"
          >
            <TablePanel :table="table" :adventure="adventure" :session="session" />
          </div>
          <div v-show="sideTab === 'log'" id="side-panel-log" role="tabpanel" aria-labelledby="side-tab-log">
            <SessionLog v-model:session="session" :adventure-title="adventure.title" />
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.spread {
  justify-content: space-between;
  align-items: center;
}

.live {
  max-width: 90rem;
}

.graph,
.summary {
  margin-bottom: 1rem;
}

.summary summary {
  cursor: pointer;
  font-weight: 600;
}

.summary .secret {
  margin: 0.5rem 0 0;
}

.glance {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.glance-line {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
}

.glance-line svg {
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  color: var(--accent);
}

.glance-line:first-child {
  font-size: 1.05rem;
  font-weight: 600;
}

.glance-label {
  margin-right: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.glance-features {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.glance-features .pill {
  padding: 0.2rem 0.7rem;
  font-weight: 500;
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
  margin: 0;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
  font-size: 1.15rem;
  line-height: 1.6;
  white-space: pre-line;
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

.quick {
  margin-left: 0.5rem;
}

.monster summary {
  cursor: pointer;
}

.monster .show {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: var(--accent);
}

.monster[open] .show {
  display: none;
}

.monster .notes {
  display: block;
}

.entity .inline svg {
  width: 0.9rem;
  height: 0.9rem;
}

.mechanics {
  margin: 0.2rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.entity .description {
  display: block;
  font-style: italic;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
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

@media (max-width: 480px) {
  .side-tabs button {
    padding-inline: 0.4rem;
  }
}

.here {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

/* The side column stays in view and scrolls on its own while the scene is read. */
.side {
  position: sticky;
  top: 4.25rem;
  max-height: calc(100vh - 5.25rem);
  overflow-y: auto;
  padding-bottom: 0.25rem;
}

@media (max-width: 960px) {
  .side {
    position: static;
    max-height: none;
    overflow: visible;
  }
}
</style>
