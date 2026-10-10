<script setup lang="ts">
import { type Adventure, createScene, removeScene, type Scene } from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';

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

function remove() {
  if (!window.confirm(t('scenes.deleteConfirm', { title: props.scene.title }))) return;
  const next = otherScenes.value[0]?.id;
  Object.assign(props.adventure, removeScene(props.adventure, props.scene.id));
  if (next) emit('select', next);
}
</script>

<template>
  <div class="card stack">
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
    </div>

    <label class="field">
      <span>{{ t('scenes.description') }}</span>
      <textarea v-model="scene.description" rows="4" :placeholder="t('scenes.descriptionHint')" />
    </label>

    <label class="field">
      <span>{{ t('scenes.notes') }}</span>
      <textarea v-model="scene.notes" rows="4" :placeholder="t('scenes.notesHint')" />
    </label>

    <fieldset>
      <legend>{{ t('scenes.npcs') }}</legend>
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
      <legend>{{ t('scenes.items') }}</legend>
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

    <fieldset class="stack">
      <legend>{{ t('scenes.exits') }}</legend>
      <p v-if="scene.exits.length === 0" class="hint">{{ t('scenes.noExits') }}</p>
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
          <button class="small" type="button" @click="emit('select', exit.targetSceneId)">
            {{ t('scenes.goTo') }}
          </button>
          <button class="small danger" type="button" @click="scene.exits.splice(index, 1)">
            {{ t('common.remove') }}
          </button>
        </div>
      </div>
      <div class="row">
        <button type="button" :disabled="otherScenes.length === 0" @click="addExit">
          {{ t('scenes.addExit') }}
        </button>
        <button type="button" @click="addExitToNewScene">{{ t('scenes.addExitToNew') }}</button>
      </div>
      <p v-if="incoming.length > 0" class="hint">
        {{ t('scenes.reachedFrom') }}
        <template v-for="(source, i) in incoming" :key="source.id">
          <a href="#" @click.prevent="emit('select', source.id)">{{ source.title }}</a
          ><template v-if="i < incoming.length - 1">, </template>
        </template>
      </p>
    </fieldset>

    <div class="row">
      <button class="danger" type="button" @click="remove">{{ t('scenes.delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6rem 0.8rem 0.8rem;
  margin: 0;
}

legend {
  font-weight: 600;
  padding: 0 0.3rem;
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

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
}

.exit {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr auto;
  gap: 0.5rem;
  align-items: end;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed var(--border);
}

@media (max-width: 720px) {
  .exit {
    grid-template-columns: 1fr;
  }
}

.exit-actions {
  padding-bottom: 0.2rem;
}
</style>
