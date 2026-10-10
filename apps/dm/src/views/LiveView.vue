<script setup lang="ts">
import {
  addCombatants,
  addLogNote,
  combatantFromNpc,
  combatantsFromEncounter,
  moveToScene,
  type Session,
  startSession,
  toggleClueFound,
} from '@lorewarden/core';
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import InitiativeTracker from '../components/InitiativeTracker.vue';
import ItemCard from '../components/ItemCard.vue';
import NpcCard from '../components/NpcCard.vue';
import SceneGraph from '../components/SceneGraph.vue';
import SessionLog from '../components/SessionLog.vue';
import { useAdventure } from '../composables/useAdventure';
import { useAutosave } from '../composables/useAutosave';
import { getLatestSession, saveSession } from '../storage/database';

const props = defineProps<{ id: string }>();
const { t, d } = useI18n();

const { adventure, loading, scenesById, npcsById, itemsById } = useAdventure(toRef(props, 'id'));

const session = ref<Session>();
const { failed: saveFailed, markSaved } = useAutosave(session, saveSession);
const showMap = ref(false);

// Continue the latest session of this adventure, or start the first one.
watch(adventure, async (value) => {
  if (!value || session.value?.adventureId === value.id) return;
  const latest = await getLatestSession(value.id);
  markSaved(latest);
  session.value = latest ?? startSession(value);
});

const scene = computed(() => {
  const id = session.value?.currentSceneId;
  return id ? scenesById.value.get(id) : undefined;
});

const sceneNpcs = computed(() => scene.value?.npcIds.flatMap((id) => npcsById.value.get(id) ?? []));
const sceneItems = computed(() =>
  scene.value?.itemIds.flatMap((id) => itemsById.value.get(id) ?? []),
);

const sceneClues = computed(() => {
  const id = scene.value?.id;
  return id ? (adventure.value?.clues ?? []).filter((clue) => clue.sceneIds.includes(id)) : [];
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
  return a.encounters
    .filter((e) => s.encounterIds.includes(e.id) || e.sceneId === s.id)
    .map((encounter) => ({
      id: encounter.id,
      difficulty: encounter.difficulty,
      monsters: encounter.monsters.map(({ poolMonsterId, count }) => {
        const pool = a.monsterPool.find((m) => m.id === poolMonsterId);
        return {
          key: poolMonsterId,
          count,
          name: pool?.overrides.name ?? pool?.name ?? poolMonsterId,
          notes: pool?.overrides.notes,
        };
      }),
    }));
});

function goTo(sceneId: string) {
  const target = scenesById.value.get(sceneId);
  if (target && session.value) session.value = moveToScene(session.value, target);
}

function onJump(event: Event) {
  goTo((event.target as HTMLSelectElement).value);
}

function addEncounter(encounterId: string) {
  if (!adventure.value || !session.value) return;
  const combatants = combatantsFromEncounter(adventure.value, encounterId);
  session.value = addCombatants(session.value, combatants);
}

function addNpc(npcId: string) {
  const npc = npcsById.value.get(npcId);
  if (npc && session.value) session.value = addCombatants(session.value, [combatantFromNpc(npc)]);
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
      <header class="page-header">
        <div>
          <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }" class="hint">
            ← {{ t('live.backToEditor') }}
          </RouterLink>
          <h1>{{ adventure.title }}</h1>
          <p class="hint">
            {{ t('live.sessionStarted', { date: d(new Date(session.startedAt), 'short') }) }}
          </p>
          <p v-if="adventure.clues.length > 0" class="hint">
            {{
              t('live.cluesFound', {
                found: session.foundClueIds.length,
                total: adventure.clues.length,
              })
            }}
          </p>
          <p v-if="saveFailed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
        </div>
        <div class="row">
          <label class="inline">
            <span>{{ t('live.jumpTo') }}</span>
            <select :value="session.currentSceneId ?? ''" @change="onJump">
              <option value="" disabled>{{ t('live.chooseScene') }}</option>
              <option v-for="s in adventure.scenes" :key="s.id" :value="s.id">{{ s.title }}</option>
            </select>
          </label>
          <button :aria-pressed="showMap" @click="showMap = !showMap">{{ t('live.map') }}</button>
          <button @click="newSession">{{ t('live.newSession') }}</button>
        </div>
      </header>

      <details v-if="adventure.summary" class="card summary">
        <summary>{{ t('live.summary') }}</summary>
        <p class="secret">{{ adventure.summary }}</p>
      </details>

      <SceneGraph
        v-if="showMap"
        class="map"
        :adventure="adventure"
        :current-id="session.currentSceneId"
        :selected-id="session.currentSceneId"
        @select="goTo"
      />

      <div class="live-grid">
        <section class="stack scene">
          <template v-if="scene">
            <h2 class="scene-title">{{ scene.title }}</h2>
            <blockquote v-if="scene.description" class="read-aloud">
              {{ scene.description }}
            </blockquote>
            <p v-if="scene.notes" class="secret">{{ scene.notes }}</p>

            <div v-if="sceneClues.length > 0" class="stack">
              <h3>{{ t('live.clues') }}</h3>
              <ul class="list stack">
                <li v-for="clue in sceneClues" :key="clue.id">
                  <label class="inline clue" :class="{ found: isFound(clue.id) }">
                    <input
                      type="checkbox"
                      :checked="isFound(clue.id)"
                      @change="toggleClue(clue.id)"
                    />
                    <span>
                      {{ clue.text }}
                      <small v-if="clue.notes" class="muted"> · {{ clue.notes }}</small>
                    </span>
                  </label>
                </li>
              </ul>
            </div>

            <div v-if="scene.exits.length > 0" class="stack exits">
              <h3>{{ t('live.exits') }}</h3>
              <div class="row">
                <button
                  v-for="(exit, i) in scene.exits"
                  :key="i"
                  class="exit"
                  @click="goTo(exit.targetSceneId)"
                >
                  <span>{{ exit.label }} →</span>
                  <small v-if="exit.condition" class="muted">{{ exit.condition }}</small>
                </button>
              </div>
            </div>
            <p v-else class="hint">
              {{ scene.ending ? t('live.ending') : t('live.noExits') }}
            </p>

            <div v-if="sceneEncounters.length > 0" class="stack">
              <h3>{{ t('live.encounters') }}</h3>
              <article v-for="encounter in sceneEncounters" :key="encounter.id" class="card entity">
                <ul class="list">
                  <li v-for="monster in encounter.monsters" :key="monster.key">
                    <strong>{{ monster.count }}× {{ monster.name }}</strong>
                    <span v-if="monster.notes" class="muted"> · {{ monster.notes }}</span>
                  </li>
                </ul>
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

            <div v-if="sceneNpcs && sceneNpcs.length > 0" class="stack">
              <h3>{{ t('live.npcs') }}</h3>
              <div class="cards">
                <NpcCard v-for="npc in sceneNpcs" :key="npc.id" :npc="npc">
                  <button class="small" @click="addNpc(npc.id)">
                    {{ t('live.addToInitiative') }}
                  </button>
                </NpcCard>
              </div>
            </div>

            <div v-if="sceneItems && sceneItems.length > 0" class="stack">
              <h3>{{ t('live.loot') }}</h3>
              <div class="cards">
                <ItemCard v-for="item in sceneItems" :key="item.id" :item="item">
                  <button class="small" @click="handOut(item.name)">{{ t('live.handOut') }}</button>
                </ItemCard>
              </div>
            </div>
          </template>
          <p v-else class="muted">{{ t('live.noScene') }}</p>
        </section>

        <aside class="stack side">
          <InitiativeTracker v-model:session="session" />
          <SessionLog v-model:session="session" :adventure-title="adventure.title" />
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.live {
  max-width: 90rem;
}

.map,
.summary {
  margin-bottom: 1rem;
}

.summary summary {
  cursor: pointer;
  font-weight: 600;
}

.summary p {
  margin: 0.5rem 0 0;
  white-space: pre-line;
}

.clue {
  align-items: flex-start;
}

.clue.found span {
  text-decoration: line-through;
  color: var(--muted);
}

.live-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 30rem);
  gap: 1.25rem;
  align-items: start;
}

@media (max-width: 960px) {
  .live-grid {
    grid-template-columns: 1fr;
  }
}

.scene-title {
  font-size: 1.6rem;
}

.read-aloud {
  margin: 0;
  padding: 0.9rem 1.1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--muted);
  border-radius: var(--radius);
  font-size: 1.1rem;
  font-style: italic;
  white-space: pre-line;
}

.scene > .secret {
  white-space: pre-line;
  margin: 0;
}

h3 {
  font-size: 1rem;
  margin: 0;
  color: var(--muted);
}

.exit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.6rem 1rem;
  font-weight: 600;
  text-align: left;
}

.exit small {
  font-weight: 400;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
}

.side {
  position: sticky;
  top: 1rem;
}

@media (max-width: 960px) {
  .side {
    position: static;
  }
}
</style>
