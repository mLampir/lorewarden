<script setup lang="ts">
import {
  checkIntegrity,
  createClue,
  createItem,
  createNpc,
  createScene,
  type ReviewHint,
  removeClue,
  removeItem,
  removeNpc,
  reviewAdventure,
  serializeAdventure,
} from '@lorewarden/core';
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdventureMonsters from '../components/AdventureMonsters.vue';
import ClueEditor from '../components/ClueEditor.vue';
import ItemEditor from '../components/ItemEditor.vue';
import NpcEditor from '../components/NpcEditor.vue';
import PartyAdapter from '../components/PartyAdapter.vue';
import SceneEditor from '../components/SceneEditor.vue';
import SceneGraph from '../components/SceneGraph.vue';
import { useAdventure } from '../composables/useAdventure';
import { downloadText, slugify } from '../lib/download';
import { fillIfBlank } from '../lib/fallback';
import { languageOptions } from '../lib/languages';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();

const { adventure, loading, saveFailed, scenesById, npcsById, itemsById } = useAdventure(
  toRef(props, 'id'),
);

type Tab = 'scenes' | 'npcs' | 'items' | 'clues' | 'monsters' | 'adventure';
const tabs: Tab[] = ['scenes', 'npcs', 'items', 'clues', 'monsters', 'adventure'];
const tab = ref<Tab>('scenes');

const selectedSceneId = ref<string>();
const selectedNpcId = ref<string>();
const selectedItemId = ref<string>();
const selectedClueId = ref<string>();

// Select the start scene and the first NPC, item and clue once the adventure is loaded.
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

const languages = computed(() => languageOptions(locale.value, adventure.value?.language));
const problems = computed(() => (adventure.value ? checkIntegrity(adventure.value) : []));
const hints = computed(() => (adventure.value ? reviewAdventure(adventure.value) : []));

/** Encounters have no name of their own, so they are named after the scene they happen in. */
function encounterPlace(encounterId: string): string {
  const encounter = adventure.value?.encounters.find((e) => e.id === encounterId);
  const scene =
    (encounter?.sceneId ? scenesById.value.get(encounter.sceneId) : undefined) ??
    adventure.value?.scenes.find((s) => s.encounterIds.includes(encounterId));
  return scene?.title ?? encounterId;
}

/** Turns a review hint into a sentence that names the scene, clue, NPC or item. */
function describeHint(hint: ReviewHint): string {
  switch (hint.kind) {
    case 'noEnding':
      return t('review.noEnding');
    case 'clueNowhere':
    case 'clueInOneScene': {
      const clue = adventure.value?.clues.find((c) => c.id === hint.clueId);
      return t(`review.${hint.kind}`, { name: clue?.text ?? hint.clueId });
    }
    case 'unusedNpc':
      return t('review.unusedNpc', { name: npcsById.value.get(hint.npcId)?.name ?? hint.npcId });
    case 'unusedItem':
      return t('review.unusedItem', {
        name: itemsById.value.get(hint.itemId)?.name ?? hint.itemId,
      });
    case 'encounterTooHard':
      return t('review.encounterTooHard', {
        name: encounterPlace(hint.encounterId),
        xp: hint.xp,
        budget: hint.budget,
      });
    case 'encounterDifficulty':
      return t('review.encounterDifficulty', {
        name: encounterPlace(hint.encounterId),
        stated: t(`review.difficulty.${hint.stated}`),
        actual: t(`review.difficulty.${hint.actual}`),
        xp: hint.xp,
      });
    default:
      return t(`review.${hint.kind}`, {
        name: scenesById.value.get(hint.sceneId)?.title ?? hint.sceneId,
      });
  }
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
    <div v-else-if="!adventure" class="stack">
      <p>{{ t('common.notFound') }}</p>
      <RouterLink to="/">{{ t('common.backToLibrary') }}</RouterLink>
    </div>
    <template v-else>
      <header class="page-header">
        <div>
          <RouterLink to="/" class="hint">← {{ t('common.backToLibrary') }}</RouterLink>
          <h1>{{ adventure.title }}</h1>
          <p v-if="saveFailed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
        </div>
        <div class="row">
          <button @click="exportAdventure">{{ t('editor.export') }}</button>
          <RouterLink :to="{ name: 'play', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button class="primary" @click="navigate">{{ t('editor.play') }}</button>
            </template>
          </RouterLink>
        </div>
      </header>

      <div class="tabs" role="tablist">
        <button
          v-for="name in tabs"
          :key="name"
          role="tab"
          :aria-selected="tab === name"
          @click="tab = name"
        >
          {{ t(`editor.tabs.${name}`) }}
        </button>
      </div>

      <section v-if="tab === 'scenes'" class="stack">
        <div class="row spread">
          <p class="hint">{{ t('scenes.graphHint') }}</p>
          <button @click="addScene">{{ t('scenes.add') }}</button>
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
          <button @click="addNpc">{{ t('npcs.add') }}</button>
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
          @remove="deleteNpc(selectedNpc.id)"
        />
        <p v-else class="muted">{{ t('npcs.none') }}</p>
      </section>

      <section v-else-if="tab === 'items'" class="master-detail">
        <div class="stack">
          <button @click="addItem">{{ t('items.add') }}</button>
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
          <button @click="addClue">{{ t('clues.add') }}</button>
          <p class="hint">{{ t('clues.hint') }}</p>
          <ul class="list">
            <li v-for="clue in adventure.clues" :key="clue.id">
              <button
                class="entry"
                :aria-current="clue.id === selectedClueId"
                @click="selectedClueId = clue.id"
              >
                {{ clue.text }}
                <span class="hint">{{ t('clues.sceneCount', clue.sceneIds.length) }}</span>
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
              <span>{{ t('adventure.partySize') }}</span>
              <input v-model.number="adventure.party.size" type="number" min="1" max="12" />
            </label>
            <label class="field">
              <span>{{ t('adventure.partyLevel') }}</span>
              <input v-model.number="adventure.party.level" type="number" min="1" max="20" />
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
    </template>
  </main>
</template>

<style scoped>
.spread {
  justify-content: space-between;
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
