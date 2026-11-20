<script setup lang="ts">
import {
  builtinTables,
  clueSceneIds,
  copyRandomTable,
  createClue,
  createItem,
  createNpc,
  createPuzzle,
  createRandomTable,
  createScene,
  removeClue,
  removeItem,
  removeNpc,
  removePuzzle,
  removeRandomTable,
  serializeAdventure,
  stripLinks,
} from '@lorewarden/core';
import {
  BookText,
  Check,
  ChevronLeft,
  ClipboardList,
  Dices,
  Download,
  Gem,
  LoaderCircle,
  Map as MapIcon,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Skull,
  Users,
  X,
} from '@lucide/vue';
import { type Component, computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdventureMissing from '../components/AdventureMissing.vue';
import AdventureMonsters from '../components/AdventureMonsters.vue';
import AdventureSettings from '../components/AdventureSettings.vue';
import ClueEditor from '../components/ClueEditor.vue';
import ItemEditor from '../components/ItemEditor.vue';
import NpcEditor from '../components/NpcEditor.vue';
import PuzzleEditor from '../components/PuzzleEditor.vue';
import RandomTableEditor from '../components/RandomTableEditor.vue';
import SceneEditor from '../components/SceneEditor.vue';
import SceneGraph from '../components/SceneGraph.vue';
import { useAdventure } from '../composables/useAdventure';
import { useAdventureParty } from '../composables/useAdventureParty';
import { useLeaveGuard } from '../composables/useLeaveGuard';
import { useQuickSearchPage } from '../composables/useQuickSearch';
import { downloadText, slugify } from '../lib/download';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();

const { adventure, loading, saveFailed, savePending, conflict, scenesById, npcsById, itemsById } =
  useAdventure(toRef(props, 'id'));
useLeaveGuard(savePending);

type Tab = 'scenes' | 'npcs' | 'items' | 'clues' | 'puzzles' | 'tables' | 'monsters' | 'adventure';
const tabs: Tab[] = [
  'scenes',
  'npcs',
  'items',
  'clues',
  'puzzles',
  'tables',
  'monsters',
  'adventure',
];
const tab = ref<Tab>('scenes');
const tabIcons: Record<Tab, Component> = {
  scenes: MapIcon,
  npcs: Users,
  items: Gem,
  clues: Search,
  puzzles: Puzzle,
  tables: Dices,
  monsters: Skull,
  adventure: BookText,
};
/** How many entries a tab holds, shown next to its name. */
const tabCount = (name: Tab) => {
  const value = adventure.value;
  if (!value) return undefined;
  const counts: Partial<Record<Tab, number>> = {
    scenes: value.scenes.length,
    npcs: value.npcs.length,
    items: value.items.length,
    clues: value.clues.length,
    puzzles: value.puzzles.length,
    tables: value.randomTables.length,
    monsters: value.monsters.length,
  };
  return counts[name];
};

const selectedSceneId = ref<string>();
const selectedNpcId = ref<string>();
const selectedItemId = ref<string>();
const selectedClueId = ref<string>();
const selectedPuzzleId = ref<string>();
const selectedTableId = ref<string>();

// Select the start scene and the first NPC, item, clue and puzzle once the adventure is loaded.
watch(adventure, (value) => {
  if (!value) return;
  if (!selectedSceneId.value || !scenesById.value.has(selectedSceneId.value)) {
    selectedSceneId.value = value.startSceneId ?? value.scenes[0]?.id;
  }
  if (!selectedNpcId.value || !npcsById.value.has(selectedNpcId.value)) {
    selectedNpcId.value = value.npcs[0]?.id;
  }
  if (!selectedItemId.value || !itemsById.value.has(selectedItemId.value)) {
    selectedItemId.value = value.items[0]?.id;
  }
  if (!selectedClueId.value || !value.clues.some((c) => c.id === selectedClueId.value)) {
    selectedClueId.value = value.clues[0]?.id;
  }
  if (!selectedPuzzleId.value || !value.puzzles.some((p) => p.id === selectedPuzzleId.value)) {
    selectedPuzzleId.value = value.puzzles[0]?.id;
  }
  if (!selectedTableId.value || !value.randomTables.some((r) => r.id === selectedTableId.value)) {
    selectedTableId.value = value.randomTables[0]?.id;
  }
});

const selectedScene = computed(() =>
  selectedSceneId.value ? scenesById.value.get(selectedSceneId.value) : undefined,
);
const selectedNpc = computed(() =>
  selectedNpcId.value ? npcsById.value.get(selectedNpcId.value) : undefined,
);
const selectedItem = computed(() =>
  selectedItemId.value ? itemsById.value.get(selectedItemId.value) : undefined,
);

const selectedClue = computed(() =>
  adventure.value?.clues.find((clue) => clue.id === selectedClueId.value),
);

const selectedPuzzle = computed(() =>
  adventure.value?.puzzles.find((puzzle) => puzzle.id === selectedPuzzleId.value),
);

const selectedTable = computed(() =>
  adventure.value?.randomTables.find((table) => table.id === selectedTableId.value),
);

// The quick search opens scenes, NPCs and items in their tab.
useQuickSearchPage({
  adventure,
  openScene: (id) => {
    tab.value = 'scenes';
    selectedSceneId.value = id;
  },
  openNpc: (id) => {
    tab.value = 'npcs';
    selectedNpcId.value = id;
  },
  openItem: (id) => {
    tab.value = 'items';
    selectedItemId.value = id;
  },
});

const { parties, party, choose: chooseParty } = useAdventureParty(adventure);

function scenesWith(kind: 'npcIds' | 'itemIds', id: string): string[] {
  return (adventure.value?.scenes ?? []).filter((s) => s[kind].includes(id)).map((s) => s.title);
}

function addScene() {
  if (!adventure.value) return;
  const scene = createScene(t('scenes.newTitle'));
  adventure.value.scenes.push(scene);
  adventure.value.startSceneId ??= scene.id;
  selectedSceneId.value = scene.id;
}

function addNpc() {
  if (!adventure.value) return;
  const npc = createNpc(t('npcs.newName'));
  adventure.value.npcs.push(npc);
  selectedNpcId.value = npc.id;
}

function deleteNpc(id: string) {
  if (!adventure.value) return;
  const npc = npcsById.value.get(id);
  if (!npc || !window.confirm(t('npcs.deleteConfirm', { name: npc.name }))) return;
  adventure.value = removeNpc(adventure.value, id);
}

function addItem() {
  if (!adventure.value) return;
  const item = createItem(t('items.newName'));
  adventure.value.items.push(item);
  selectedItemId.value = item.id;
}

function deleteItem(id: string) {
  if (!adventure.value) return;
  const item = itemsById.value.get(id);
  if (!item || !window.confirm(t('items.deleteConfirm', { name: item.name }))) return;
  adventure.value = removeItem(adventure.value, id);
}

function addClue() {
  if (!adventure.value) return;
  const clue = createClue(t('clues.newText'));
  adventure.value.clues.push(clue);
  selectedClueId.value = clue.id;
}

function deleteClue(id: string) {
  if (!adventure.value || !window.confirm(t('clues.deleteConfirm'))) return;
  adventure.value = removeClue(adventure.value, id);
}

function addPuzzle() {
  if (!adventure.value) return;
  const puzzle = createPuzzle(t('puzzles.newTitle'), selectedSceneId.value);
  adventure.value.puzzles.push(puzzle);
  selectedPuzzleId.value = puzzle.id;
}

function deletePuzzle(id: string) {
  if (!adventure.value) return;
  const puzzle = adventure.value.puzzles.find((p) => p.id === id);
  if (!puzzle || !window.confirm(t('puzzles.deleteConfirm', { title: puzzle.title }))) return;
  adventure.value = removePuzzle(adventure.value, id);
}

function addTable() {
  if (!adventure.value) return;
  const table = createRandomTable(t('randomTables.newTitle'));
  adventure.value.randomTables.push(table);
  selectedTableId.value = table.id;
}

/** The built-in tables in the adventure's language, to copy and change. */
const builtin = computed(() => builtinTables(adventure.value?.language ?? locale.value));

function copyBuiltinTable(event: Event) {
  const select = event.target as HTMLSelectElement;
  const source = builtin.value.find((table) => table.id === select.value);
  select.value = '';
  if (!adventure.value || !source) return;
  const table = copyRandomTable(source);
  adventure.value.randomTables.push(table);
  selectedTableId.value = table.id;
}

function deleteTable(id: string) {
  if (!adventure.value) return;
  const table = adventure.value.randomTables.find((r) => r.id === id);
  if (!table || !window.confirm(t('randomTables.deleteConfirm', { title: table.title }))) return;
  adventure.value = removeRandomTable(adventure.value, id);
}

function exportAdventure() {
  if (!adventure.value) return;
  downloadText(
    `${slugify(adventure.value.title)}.adventure.json`,
    serializeAdventure(adventure.value),
  );
}
</script>

<template>
  <main class="page">
    <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
    <AdventureMissing v-else-if="!adventure" :id="id" />
    <template v-else>
      <header class="page-header">
        <div>
          <RouterLink to="/" class="back"><ChevronLeft aria-hidden="true" />{{ t('common.backToLibrary') }}</RouterLink>
          <div class="title-row">
            <h1>{{ adventure.title }}</h1>
            <span v-if="!saveFailed" class="save-state" role="status">
              <template v-if="savePending">
                <LoaderCircle class="spin" aria-hidden="true" />{{ t('editor.saving') }}
              </template>
              <template v-else><Check aria-hidden="true" />{{ t('editor.saved') }}</template>
            </span>
          </div>
          <p v-if="saveFailed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
          <p v-if="conflict" class="changed-elsewhere" role="status">
            <RefreshCw aria-hidden="true" />
            <span>{{ t('editor.changedElsewhere') }}</span>
            <button
              class="ghost icon-only small"
              :title="t('common.close')"
              :aria-label="t('common.close')"
              @click="conflict = false"
            >
              <X aria-hidden="true" />
            </button>
          </p>
        </div>
        <div class="row">
          <button @click="exportAdventure">
            <Download aria-hidden="true" />{{ t('editor.export') }}
          </button>
          <RouterLink :to="{ name: 'prep', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button @click="navigate">
                <ClipboardList aria-hidden="true" />{{ t('library.prepare') }}
              </button>
            </template>
          </RouterLink>
          <RouterLink :to="{ name: 'play', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button class="primary" @click="navigate">
                <Play aria-hidden="true" />{{ t('editor.play') }}
              </button>
            </template>
          </RouterLink>
        </div>
      </header>

      <div class="tabs" role="tablist">
        <button
          v-for="name in tabs"
          :key="name"
          :id="`editor-tab-${name}`"
          role="tab"
          :aria-selected="tab === name"
          aria-controls="editor-panel"
          @click="tab = name"
        >
          <component :is="tabIcons[name]" aria-hidden="true" />
          {{ t(`editor.tabs.${name}`) }}
          <span v-if="tabCount(name)" class="count">{{ tabCount(name) }}</span>
        </button>
      </div>

      <div id="editor-panel" role="tabpanel" :aria-labelledby="`editor-tab-${tab}`">
        <section v-if="tab === 'scenes'" class="stack">
          <div class="row spread">
            <p class="hint">{{ t('scenes.graphHint') }}</p>
            <button @click="addScene"><Plus aria-hidden="true" />{{ t('scenes.add') }}</button>
          </div>
          <SceneGraph
            :adventure="adventure"
            :selected-id="selectedSceneId"
            @select="selectedSceneId = $event"
          />
          <SceneEditor
            v-if="selectedScene"
            :key="selectedScene.id"
            :adventure="adventure"
            :scene="selectedScene"
            @select="selectedSceneId = $event"
          />
          <p v-else class="muted">{{ t('scenes.none') }}</p>
        </section>

        <section v-else-if="tab === 'npcs'" class="master-detail">
          <div class="stack">
            <button @click="addNpc">
              <Plus aria-hidden="true" />{{ t('npcs.add') }}
            </button>
            <ul class="list">
              <li v-for="npc in adventure.npcs" :key="npc.id">
                <button
                  class="entry"
                  :aria-current="npc.id === selectedNpcId"
                  @click="selectedNpcId = npc.id"
                >
                  {{ npc.name }} <span v-if="npc.role" class="hint">{{ npc.role }}</span>
                </button>
              </li>
            </ul>
          </div>
          <NpcEditor
            v-if="selectedNpc"
            :key="selectedNpc.id"
            :npc="selectedNpc"
            :scenes="scenesWith('npcIds', selectedNpc.id)"
            :monster-pool="adventure.monsterPool"
            @remove="deleteNpc(selectedNpc.id)"
          />
          <p v-else class="muted">{{ t('npcs.none') }}</p>
        </section>

        <section v-else-if="tab === 'items'" class="master-detail">
          <div class="stack">
            <button @click="addItem">
              <Plus aria-hidden="true" />{{ t('items.add') }}
            </button>
            <ul class="list">
              <li v-for="item in adventure.items" :key="item.id">
                <button
                  class="entry"
                  :aria-current="item.id === selectedItemId"
                  @click="selectedItemId = item.id"
                >
                  {{ item.name }}
                </button>
              </li>
            </ul>
          </div>
          <ItemEditor
            v-if="selectedItem"
            :key="selectedItem.id"
            :item="selectedItem"
            :scenes="scenesWith('itemIds', selectedItem.id)"
            @remove="deleteItem(selectedItem.id)"
          />
          <p v-else class="muted">{{ t('items.none') }}</p>
        </section>

        <section v-else-if="tab === 'clues'" class="master-detail">
          <div class="stack">
            <button @click="addClue">
              <Plus aria-hidden="true" />{{ t('clues.add') }}
            </button>
            <p class="hint">{{ t('clues.hint') }}</p>
            <ul class="list">
              <li v-for="clue in adventure.clues" :key="clue.id">
                <button
                  class="entry"
                  :aria-current="clue.id === selectedClueId"
                  @click="selectedClueId = clue.id"
                >
                  {{ stripLinks(clue.text) }}
                  <span class="hint">{{ t('clues.sceneCount', clueSceneIds(adventure, clue).length) }}</span>
                </button>
              </li>
            </ul>
          </div>
          <ClueEditor
            v-if="selectedClue"
            :key="selectedClue.id"
            :adventure="adventure"
            :clue="selectedClue"
            @remove="deleteClue(selectedClue.id)"
          />
          <p v-else class="muted">{{ t('clues.none') }}</p>
        </section>

        <section v-else-if="tab === 'puzzles'" class="master-detail">
          <div class="stack">
            <button @click="addPuzzle"><Plus aria-hidden="true" />{{ t('puzzles.add') }}</button>
            <p class="hint">{{ t('puzzles.hint') }}</p>
            <ul class="list">
              <li v-for="puzzle in adventure.puzzles" :key="puzzle.id">
                <button
                  class="entry"
                  :aria-current="puzzle.id === selectedPuzzleId"
                  @click="selectedPuzzleId = puzzle.id"
                >
                  {{ puzzle.title }}
                  <span v-if="puzzle.sceneId" class="hint">
                    {{ scenesById.get(puzzle.sceneId)?.title }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
          <PuzzleEditor
            v-if="selectedPuzzle"
            :key="selectedPuzzle.id"
            :adventure="adventure"
            :puzzle="selectedPuzzle"
            @remove="deletePuzzle(selectedPuzzle.id)"
          />
          <p v-else class="muted">{{ t('puzzles.none') }}</p>
        </section>

        <section v-else-if="tab === 'tables'" class="master-detail">
          <div class="stack">
            <button @click="addTable"><Plus aria-hidden="true" />{{ t('randomTables.add') }}</button>
            <select :aria-label="t('randomTables.copyBuiltin')" @change="copyBuiltinTable">
              <option value="">{{ t('randomTables.copyBuiltin') }}</option>
              <option v-for="table in builtin" :key="table.id" :value="table.id">
                {{ table.title }}
              </option>
            </select>
            <p class="hint">{{ t('randomTables.hint') }}</p>
            <ul class="list">
              <li v-for="table in adventure.randomTables" :key="table.id">
                <button
                  class="entry"
                  :aria-current="table.id === selectedTableId"
                  @click="selectedTableId = table.id"
                >
                  {{ table.title }}
                  <span class="hint">{{ t('randomTables.entryCount', table.entries.length) }}</span>
                </button>
              </li>
            </ul>
          </div>
          <RandomTableEditor
            v-if="selectedTable"
            :key="selectedTable.id"
            :adventure="adventure"
            :table="selectedTable"
            @remove="deleteTable(selectedTable.id)"
          />
          <p v-else class="muted">{{ t('randomTables.none') }}</p>
        </section>

        <AdventureMonsters v-else-if="tab === 'monsters'" :adventure="adventure" />

        <AdventureSettings
          v-else
          v-model:adventure="adventure"
          :parties="parties"
          :party="party"
          @choose-party="chooseParty"
        />
      </div>
    </template>
  </main>
</template>

<style scoped>
.changed-elsewhere {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  padding: 0.35rem 0.35rem 0.35rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  font-size: 0.875rem;
}

.changed-elsewhere > svg {
  flex: none;
  width: 1rem;
  height: 1rem;
  color: var(--accent);
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
}

.save-state {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--muted);
}

.save-state svg {
  width: 0.95rem;
  height: 0.95rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tabs {
  overflow-x: auto;
}

.tabs button {
  gap: 0.4rem;
  white-space: nowrap;
}

.tabs svg {
  width: 1rem;
  height: 1rem;
}
</style>
