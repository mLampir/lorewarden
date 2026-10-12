<script setup lang="ts">
import {
  type Adventure,
  addSceneAsset,
  createScene,
  removeAsset,
  removeScene,
  type Scene,
  stripLinks,
} from '@lorewarden/core';
import {
  ArrowRight,
  DoorOpen,
  Eye,
  Gem,
  Image,
  Map as MapIcon,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';
import { readImage, titleFromFileName } from '../lib/image';
import BattleMapView from './BattleMapView.vue';
import SceneEncounters from './SceneEncounters.vue';

const props = defineProps<{ adventure: Adventure; scene: Scene }>();
const emit = defineEmits<{ select: [sceneId: string] }>();

const { t } = useI18n();

const otherScenes = computed(() => props.adventure.scenes.filter((s) => s.id !== props.scene.id));

const isStart = computed({
  get: () => props.adventure.startSceneId === props.scene.id,
  set: (value: boolean) => {
    if (value) props.adventure.startSceneId = props.scene.id;
  },
});

/** Scenes whose exits lead here, so the game master sees how the party can arrive. */
const incoming = computed(() =>
  props.adventure.scenes.filter((s) => s.exits.some((e) => e.targetSceneId === props.scene.id)),
);

function toggle(list: string[], id: string) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}

/** Three slots for the features, more if a file brought more; empty ones go when a field is left. */
const featureSlots = computed(() =>
  Array.from({ length: Math.max(3, props.scene.features.length) }, (_, i) => i),
);

function setFeature(index: number, value: string) {
  const features = featureSlots.value.map((i) => props.scene.features[i] ?? '');
  features[index] = value;
  props.scene.features = features;
}

function tidyFeatures() {
  props.scene.features = props.scene.features.map((f) => f.trim()).filter((f) => f !== '');
}

function addExit() {
  const target = otherScenes.value[0];
  if (!target) return addExitToNewScene();
  props.scene.exits.push({ label: target.title, targetSceneId: target.id });
}

function addExitToNewScene() {
  const scene = createScene(t('scenes.newTitle'));
  props.adventure.scenes.push(scene);
  props.scene.exits.push({ label: scene.title, targetSceneId: scene.id });
}

const maps = computed(() =>
  props.adventure.assets.filter(
    (asset) => asset.kind === 'map' && props.scene.assetIds.includes(asset.id),
  ),
);
const mapFailed = ref(false);
const mapInput = ref<HTMLInputElement>();

/** Letters, notices and pictures the game master can show on the players' phones. */
const handouts = computed(() =>
  props.adventure.assets.filter(
    (asset) => asset.kind !== 'map' && props.scene.assetIds.includes(asset.id),
  ),
);
const handoutFailed = ref(false);
const handoutInput = ref<HTMLInputElement>();

async function addImages(event: Event, kind: 'map' | 'handout') {
  const failed = kind === 'map' ? mapFailed : handoutFailed;
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  failed.value = false;
  for (const file of files) {
    try {
      const image = await readImage(file);
      const asset = { kind, title: titleFromFileName(file.name), ...image };
      Object.assign(props.adventure, addSceneAsset(props.adventure, props.scene.id, asset));
    } catch {
      failed.value = true;
    }
  }
}

function removeBattleMap() {
  if (window.confirm(t('battleMap.deleteConfirm'))) props.scene.battleMap = undefined;
}

function removeMap(assetId: string, title: string) {
  if (!window.confirm(t('scenes.imageDeleteConfirm', { title }))) return;
  Object.assign(props.adventure, removeAsset(props.adventure, assetId));
}

function remove() {
  if (!window.confirm(t('scenes.deleteConfirm', { title: props.scene.title }))) return;
  const next = otherScenes.value[0]?.id;
  Object.assign(props.adventure, removeScene(props.adventure, props.scene.id));
  if (next) emit('select', next);
}
</script>

<template>
  <div class="card stack scene-editor">
    <div class="row spread">
      <label class="field grow">
        <span>{{ t('scenes.title') }}</span>
        <input
          v-model="scene.title"
          required
          @blur="fillIfBlank(scene, 'title', t('common.untitled'))"
        />
      </label>
      <label class="inline start-toggle">
        <input v-model="isStart" type="checkbox" :disabled="isStart" />
        {{ t('scenes.isStart') }}
      </label>
      <label class="inline start-toggle">
        <input v-model="scene.ending" type="checkbox" />
        {{ t('scenes.isEnding') }}
      </label>
      <label class="inline start-toggle" :title="t('scenes.levelUpHint')">
        <input v-model="scene.levelUp" type="checkbox" />
        {{ t('scenes.isLevelUp') }}
      </label>
    </div>

    <fieldset>
      <legend><Eye aria-hidden="true" />{{ t('scenes.glance') }}</legend>
      <div class="stack">
        <label class="field">
          <span>{{ t('scenes.purpose') }}</span>
          <input v-model="scene.purpose" :placeholder="t('scenes.purposeHint')" />
        </label>
        <div class="field">
          <span>{{ t('scenes.features') }}</span>
          <div class="features">
            <input
              v-for="i in featureSlots"
              :key="i"
              :value="scene.features[i] ?? ''"
              :aria-label="t('scenes.feature', { n: i + 1 })"
              :placeholder="t('scenes.featureHint')"
              @input="setFeature(i, ($event.target as HTMLInputElement).value)"
              @blur="tidyFeatures"
            />
          </div>
        </div>
        <label class="field">
          <span>{{ t('scenes.wayOut') }}</span>
          <input v-model="scene.wayOut" :placeholder="t('scenes.wayOutHint')" />
        </label>
      </div>
    </fieldset>

    <label class="field">
      <span>{{ t('scenes.description') }}</span>
      <textarea
        v-model="scene.description"
        class="read-aloud"
        rows="4"
        :placeholder="t('scenes.descriptionHint')"
      />
    </label>

    <label class="field">
      <span>{{ t('scenes.notes') }}</span>
      <textarea
        v-model="scene.notes"
        class="secret-input"
        rows="4"
        :placeholder="t('scenes.notesHint')"
      />
      <small class="hint">{{ t('common.notesSyntax') }}</small>
    </label>

    <fieldset>
      <legend><Users aria-hidden="true" />{{ t('scenes.npcs') }}</legend>
      <p v-if="adventure.npcs.length === 0" class="hint">{{ t('scenes.noNpcsYet') }}</p>
      <div class="row">
        <label v-for="npc in adventure.npcs" :key="npc.id" class="chip">
          <input
            type="checkbox"
            :checked="scene.npcIds.includes(npc.id)"
            @change="toggle(scene.npcIds, npc.id)"
          />
          {{ npc.name }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend><Gem aria-hidden="true" />{{ t('scenes.items') }}</legend>
      <p v-if="adventure.items.length === 0" class="hint">{{ t('scenes.noItemsYet') }}</p>
      <div class="row">
        <label v-for="item in adventure.items" :key="item.id" class="chip">
          <input
            type="checkbox"
            :checked="scene.itemIds.includes(item.id)"
            @change="toggle(scene.itemIds, item.id)"
          />
          {{ item.name }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend><Search aria-hidden="true" />{{ t('scenes.clues') }}</legend>
      <p v-if="adventure.clues.length === 0" class="hint">{{ t('scenes.noCluesYet') }}</p>
      <div class="row">
        <label v-for="clue in adventure.clues" :key="clue.id" class="chip">
          <input
            type="checkbox"
            :checked="clue.sceneIds.includes(scene.id)"
            @change="toggle(clue.sceneIds, scene.id)"
          />
          {{ stripLinks(clue.text) }}
        </label>
      </div>
    </fieldset>

    <SceneEncounters :adventure="adventure" :scene="scene" />

    <fieldset class="stack">
      <legend><DoorOpen aria-hidden="true" />{{ t('scenes.exits') }}</legend>
      <p v-if="scene.exits.length === 0" class="hint">
        {{ scene.ending ? t('scenes.noExitsEnding') : t('scenes.noExits') }}
      </p>
      <div v-for="(exit, index) in scene.exits" :key="index" class="exit">
        <label class="field">
          <span>{{ t('scenes.exitLabel') }}</span>
          <input
            v-model="exit.label"
            required
            @blur="fillIfBlank(exit, 'label', t('scenes.exitDefault'))"
          />
        </label>
        <label class="field">
          <span>{{ t('scenes.exitTarget') }}</span>
          <select v-model="exit.targetSceneId">
            <option v-for="target in otherScenes" :key="target.id" :value="target.id">
              {{ target.title }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('scenes.exitCondition') }}</span>
          <input v-model="exit.condition" :placeholder="t('common.optional')" />
        </label>
        <div class="row exit-actions">
          <button
            class="ghost icon-only"
            type="button"
            :title="t('scenes.goTo')"
            :aria-label="t('scenes.goTo')"
            @click="emit('select', exit.targetSceneId)"
          >
            <ArrowRight aria-hidden="true" />
          </button>
          <button
            class="ghost icon-only remove"
            type="button"
            :title="t('common.remove')"
            :aria-label="t('common.remove')"
            @click="scene.exits.splice(index, 1)"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="row">
        <button type="button" :disabled="otherScenes.length === 0" @click="addExit">
          <Plus aria-hidden="true" />{{ t('scenes.addExit') }}
        </button>
        <button type="button" @click="addExitToNewScene">
          <Plus aria-hidden="true" />{{ t('scenes.addExitToNew') }}
        </button>
      </div>
      <p v-if="incoming.length > 0" class="hint">
        {{ t('scenes.reachedFrom') }}
        <template v-for="(source, i) in incoming" :key="source.id">
          <a href="#" @click.prevent="emit('select', source.id)">{{ source.title }}</a
          ><template v-if="i < incoming.length - 1">, </template>
        </template>
      </p>
    </fieldset>

    <fieldset class="stack">
      <legend><MapIcon aria-hidden="true" />{{ t('scenes.maps') }}</legend>
      <template v-if="scene.battleMap">
        <BattleMapView :map="scene.battleMap" compact class="preview" />
        <label class="field">
          <span>{{ t('battleMap.notes') }}</span>
          <textarea v-model="scene.battleMap.notes" rows="2" />
        </label>
        <div class="row">
          <button class="small danger" type="button" @click="removeBattleMap">
            {{ t('battleMap.delete') }}
          </button>
        </div>
      </template>
      <p v-if="!scene.battleMap && maps.length === 0" class="hint">{{ t('scenes.noMaps') }}</p>
      <div v-for="map in maps" :key="map.id" class="map-row">
        <img :src="map.src" :alt="map.title" class="thumb" />
        <label class="field grow">
          <span>{{ t('scenes.mapTitle') }}</span>
          <input v-model="map.title" required @blur="fillIfBlank(map, 'title', t('common.untitled'))" />
        </label>
        <button class="small danger" type="button" @click="removeMap(map.id, map.title)">
          {{ t('common.remove') }}
        </button>
      </div>
      <p v-if="mapFailed" class="error" role="alert">{{ t('scenes.mapFailed') }}</p>
      <input
        ref="mapInput"
        class="sr-only"
        type="file"
        accept="image/*"
        multiple
        @change="addImages($event, 'map')"
      />
      <div class="row">
        <button type="button" @click="mapInput?.click()">
          <Upload aria-hidden="true" />{{ t('scenes.addMap') }}
        </button>
      </div>
    </fieldset>

    <fieldset class="stack">
      <legend><Image aria-hidden="true" />{{ t('scenes.handouts') }}</legend>
      <p v-if="handouts.length === 0" class="hint">{{ t('scenes.noHandouts') }}</p>
      <div v-for="handout in handouts" :key="handout.id" class="map-row">
        <img :src="handout.src" :alt="handout.title" class="thumb" />
        <label class="field grow">
          <span>{{ t('scenes.mapTitle') }}</span>
          <input
            v-model="handout.title"
            required
            @blur="fillIfBlank(handout, 'title', t('common.untitled'))"
          />
        </label>
        <button class="small danger" type="button" @click="removeMap(handout.id, handout.title)">
          {{ t('common.remove') }}
        </button>
      </div>
      <p v-if="handoutFailed" class="error" role="alert">{{ t('scenes.mapFailed') }}</p>
      <input
        ref="handoutInput"
        class="sr-only"
        type="file"
        accept="image/*"
        multiple
        @change="addImages($event, 'handout')"
      />
      <div class="row">
        <button type="button" @click="handoutInput?.click()">
          <Upload aria-hidden="true" />{{ t('scenes.addHandout') }}
        </button>
      </div>
    </fieldset>

    <div class="row">
      <button class="danger" type="button" @click="remove">
        <Trash2 aria-hidden="true" />{{ t('scenes.delete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.scene-editor {
  gap: 1rem;
  padding: 1.25rem;
}

.spread {
  justify-content: space-between;
  align-items: end;
}

.grow {
  flex: 1;
}

.start-toggle {
  padding-bottom: 0.4rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.exit {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr auto;
  gap: 0.5rem;
  align-items: end;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}

@media (max-width: 720px) {
  .features {
    grid-template-columns: 1fr;
  }

  .exit {
    grid-template-columns: 1fr;
  }
}

.preview {
  max-width: 32rem;
}

.map-row {
  display: flex;
  gap: 0.75rem;
  align-items: end;
}

.thumb {
  width: 6rem;
  height: 4rem;
  object-fit: cover;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.exit-actions {
  gap: 0.1rem;
  padding-bottom: 0.1rem;
}

.remove:hover:not(:disabled) {
  color: var(--danger);
}
</style>
