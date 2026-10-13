<script setup lang="ts">
import {
  checkIntegrity,
  clueSceneIds,
  createClue,
  createItem,
  createNpc,
  createPuzzle,
  createScene,
  type ReviewHint,
  removeClue,
  removeItem,
  removeNpc,
  removePuzzle,
  reviewAdventure,
  serializeAdventure,
  stripLinks,
} from '@lorewarden/core';
import {
  BookText,
  Check,
  ChevronLeft,
  ClipboardList,
  Download,
  Gem,
  LoaderCircle,
  Map as MapIcon,
  Play,
  Plus,
  Puzzle,
  Search,
  Skull,
  Users,
} from '@lucide/vue';
import { type Component, computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdventureMissing from '../components/AdventureMissing.vue';
import AdventureMonsters from '../components/AdventureMonsters.vue';
import ClueEditor from '../components/ClueEditor.vue';
import ItemEditor from '../components/ItemEditor.vue';
import NpcEditor from '../components/NpcEditor.vue';
import PartyAdapter from '../components/PartyAdapter.vue';
import PuzzleEditor from '../components/PuzzleEditor.vue';
import SceneEditor from '../components/SceneEditor.vue';
import SceneGraph from '../components/SceneGraph.vue';
import { useAdventure } from '../composables/useAdventure';
import { useAdventureParty } from '../composables/useAdventureParty';
import { useLeaveGuard } from '../composables/useLeaveGuard';
import { downloadText, slugify } from '../lib/download';
import { fillIfBlank } from '../lib/fallback';
import { languageOptions } from '../lib/languages';
import { readNumberField } from '../lib/numbers';
import { describeHint as describeReviewHint } from '../lib/review';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();

const { adventure, loading, saveFailed, savePending, scenesById, npcsById, itemsById } =
  useAdventure(toRef(props, 'id'));
useLeaveGuard(savePending);

type Tab = 'scenes' | 'npcs' | 'items' | 'clues' | 'puzzles' | 'monsters' | 'adventure';
const tabs: Tab[] = ['scenes', 'npcs', 'items', 'clues', 'puzzles', 'monsters', 'adventure'];
const tab = ref<Tab>('scenes');
const tabIcons: Record<Tab, Component> = {
  scenes: MapIcon,
  npcs: Users,
  items: Gem,
  clues: Search,
  puzzles: Puzzle,
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
    monsters: value.monsters.length,
  };
  return counts[name];
};

const selectedSceneId = ref<string>();
const selectedNpcId = ref<string>();
const selectedItemId = ref<string>();
const selectedClueId = ref<string>();
const selectedPuzzleId = ref<string>();

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

const { parties, party, choose: chooseParty } = useAdventureParty(adventure);

function onParty(event: Event) {
  chooseParty((event.target as HTMLSelectElement).value);
}

const languages = computed(() => languageOptions(locale.value, adventure.value?.language));
const problems = computed(() => (adventure.value ? checkIntegrity(adventure.value) : []));
const hints = computed(() => (adventure.value ? reviewAdventure(adventure.value) : []));

function describeHint(hint: ReviewHint): string {
  return adventure.value ? describeReviewHint(t, adventure.value, hint) : '';
}

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

        <AdventureMonsters v-else-if="tab === 'monsters'" :adventure="adventure" />

        <section v-else class="stack settings">
          <div class="card stack">
            <label class="field">
              <span>{{ t('adventure.title') }}</span>
              <input
                v-model="adventure.title"
                required
                @blur="fillIfBlank(adventure, 'title', t('library.untitled'))"
              />
            </label>
            <label class="field">
              <span>{{ t('adventure.summary') }}</span>
              <textarea v-model="adventure.summary" rows="5" :placeholder="t('adventure.summaryHint')" />
            </label>
            <div class="row">
              <label class="field">
                <span>{{ t('adventure.party') }}</span>
                <select :value="adventure.party.partyId ?? ''" @change="onParty">
                  <option value="">{{ t('adventure.noParty') }}</option>
                  <option
                    v-if="adventure.party.partyId && !party"
                    :value="adventure.party.partyId"
                    disabled
                  >
                    {{ t('adventure.partyMissing') }}
                  </option>
                  <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </label>
              <label class="field">
                <span>{{ t('adventure.partySize') }}</span>
                <input
                  :value="adventure.party.size"
                  type="number"
                  min="1"
                  max="12"
                  :disabled="!!party?.characters.length"
                  @change="adventure.party.size = readNumberField($event, adventure.party.size, 1, 12)"
                />
              </label>
              <label class="field">
                <span>{{ t('adventure.partyLevel') }}</span>
                <input
                  :value="adventure.party.level"
                  type="number"
                  min="1"
                  max="20"
                  :disabled="!!party?.characters.length"
                  @change="adventure.party.level = readNumberField($event, adventure.party.level, 1, 20)"
                />
              </label>
              <label class="field">
                <span>{{ t('adventure.ruleset') }}</span>
                <select v-model="adventure.ruleset">
                  <option value="srd-5.2">SRD 5.2</option>
                  <option value="srd-5.1">SRD 5.1</option>
                </select>
              </label>
              <label class="field">
                <span>{{ t('adventure.language') }}</span>
                <select v-model="adventure.language">
                  <option v-if="!adventure.language" :value="undefined">
                    {{ t('adventure.languageNotSet') }}
                  </option>
                  <option v-for="language in languages" :key="language.tag" :value="language.tag">
                    {{ language.name }}
                  </option>
                </select>
              </label>
            </div>
            <p v-if="party" class="hint">
              {{ t('adventure.partyFollows', { name: party.name }) }}
              <RouterLink :to="{ name: 'party', query: { id: party.id } }">
                {{ t('adventure.editParty') }}
              </RouterLink>
            </p>
            <label v-if="adventure.language !== 'en'" class="inline">
              <input
                type="checkbox"
                :checked="adventure.termsLanguage === 'en'"
                @change="
                  adventure.termsLanguage = ($event.target as HTMLInputElement).checked
                    ? 'en'
                    : undefined
                "
              />
              {{ t('adventure.englishTerms') }}
            </label>
            <div v-if="problems.length > 0" class="error" role="alert">
              <p>{{ t('editor.problems') }}</p>
              <ul>
                <li v-for="(problem, i) in problems" :key="i">
                  <code>{{ problem.path }}</code> {{ problem.message }}
                </li>
              </ul>
            </div>
            <p v-else class="hint">{{ t('editor.noProblems') }}</p>
            <div v-if="hints.length > 0" class="stack">
              <p>{{ t('review.heading') }}</p>
              <ul class="review">
                <li v-for="(hint, i) in hints" :key="i">{{ describeHint(hint) }}</li>
              </ul>
            </div>
            <p v-else class="hint">{{ t('review.none') }}</p>
          </div>
          <PartyAdapter :key="adventure.id" :adventure="adventure" @replace="adventure = $event" />
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
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


.settings {
  max-width: 40rem;
}

.review {
  margin: 0;
  padding-left: 1.2rem;
}

.settings input[type='number'] {
  width: 6rem;
}
</style>
