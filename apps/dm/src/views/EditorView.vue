<script setup lang="ts">
import {
  checkIntegrity,
  createItem,
  createNpc,
  createScene,
  removeItem,
  removeNpc,
  serializeAdventure,
} from '@lorewarden/core';
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ItemEditor from '../components/ItemEditor.vue';
import NpcEditor from '../components/NpcEditor.vue';
import SceneEditor from '../components/SceneEditor.vue';
import SceneGraph from '../components/SceneGraph.vue';
import { useAdventure } from '../composables/useAdventure';
import { downloadText, slugify } from '../lib/download';
import { fillIfBlank } from '../lib/fallback';

const props = defineProps<{ id: string }>();
const { t } = useI18n();

const { adventure, loading, saveFailed, scenesById, npcsById, itemsById } = useAdventure(
  toRef(props, 'id'),
);

type Tab = 'scenes' | 'npcs' | 'items' | 'adventure';
const tabs: Tab[] = ['scenes', 'npcs', 'items', 'adventure'];
const tab = ref<Tab>('scenes');

const selectedSceneId = ref<string>();
const selectedNpcId = ref<string>();
const selectedItemId = ref<string>();

// Select the start scene and the first NPC and item once the adventure is loaded.
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

const problems = computed(() => (adventure.value ? checkIntegrity(adventure.value) : []));

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

      <section v-else class="card stack settings">
        <label class="field">
          <span>{{ t('adventure.title') }}</span>
          <input
            v-model="adventure.title"
            required
            @blur="fillIfBlank(adventure, 'title', t('library.untitled'))"
          />
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
        </div>
        <div v-if="problems.length > 0" class="error" role="alert">
          <p>{{ t('editor.problems') }}</p>
          <ul>
            <li v-for="(problem, i) in problems" :key="i">
              <code>{{ problem.path }}</code> {{ problem.message }}
            </li>
          </ul>
        </div>
        <p v-else class="hint">{{ t('editor.noProblems') }}</p>
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

.settings input[type='number'] {
  width: 6rem;
}
</style>
