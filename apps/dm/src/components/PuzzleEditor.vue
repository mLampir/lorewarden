<script setup lang="ts">
import {
  type Adventure,
  createPuzzleHint,
  type Puzzle,
  removeAsset,
  setPuzzleAsset,
} from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';
import { readImage } from '../lib/image';

const props = defineProps<{ adventure: Adventure; puzzle: Puzzle }>();
const emit = defineEmits<{ remove: [] }>();

const { t } = useI18n();

const image = computed(() => props.adventure.assets.find((a) => a.id === props.puzzle.assetId));
const imageFailed = ref(false);
const imageInput = ref<HTMLInputElement>();

async function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  imageFailed.value = false;
  if (!file) return;
  try {
    const read = await readImage(file);
    const asset = { kind: 'handout' as const, title: props.puzzle.title, ...read };
    Object.assign(props.adventure, setPuzzleAsset(props.adventure, props.puzzle.id, asset));
  } catch {
    imageFailed.value = true;
  }
}

function removeImage() {
  const id = props.puzzle.assetId;
  if (id && window.confirm(t('puzzles.imageDeleteConfirm'))) {
    Object.assign(props.adventure, removeAsset(props.adventure, id));
  }
}

const newHint = ref('');

function addHint() {
  const text = newHint.value.trim();
  if (!text) return;
  props.puzzle.hints.push(createPuzzleHint(text));
  newHint.value = '';
}

/** A hint emptied by the game master is removed. */
function tidyHint(index: number) {
  if (props.puzzle.hints[index]?.text.trim() === '') props.puzzle.hints.splice(index, 1);
}

function moveHint(index: number, by: -1 | 1) {
  const [hint] = props.puzzle.hints.splice(index, 1);
  if (hint) props.puzzle.hints.splice(index + by, 0, hint);
}
</script>

<template>
  <div class="card stack">
    <label class="field">
      <span>{{ t('puzzles.title') }}</span>
      <input
        v-model="puzzle.title"
        required
        @blur="fillIfBlank(puzzle, 'title', t('common.untitled'))"
      />
    </label>
    <label class="field">
      <span>{{ t('puzzles.scene') }}</span>
      <select v-model="puzzle.sceneId">
        <option :value="undefined">{{ t('puzzles.noScene') }}</option>
        <option v-for="scene in adventure.scenes" :key="scene.id" :value="scene.id">
          {{ scene.title }}
        </option>
      </select>
    </label>
    <label class="field">
      <span>{{ t('puzzles.prompt') }}</span>
      <textarea v-model="puzzle.prompt" rows="4" :placeholder="t('puzzles.promptHint')" />
    </label>

    <fieldset class="stack">
      <legend>{{ t('puzzles.image') }}</legend>
      <p class="hint">{{ t('puzzles.imageHint') }}</p>
      <div v-if="image" class="row image-row">
        <img :src="image.src" :alt="image.title" class="thumb" />
        <button class="small danger" type="button" @click="removeImage">
          {{ t('common.remove') }}
        </button>
      </div>
      <p v-if="imageFailed" class="error" role="alert">{{ t('scenes.mapFailed') }}</p>
      <input ref="imageInput" class="sr-only" type="file" accept="image/*" @change="chooseImage" />
      <div class="row">
        <button type="button" @click="imageInput?.click()">
          {{ image ? t('puzzles.replaceImage') : t('puzzles.addImage') }}
        </button>
      </div>
    </fieldset>

    <label class="field">
      <span>{{ t('puzzles.solution') }}</span>
      <textarea v-model="puzzle.solution" rows="2" />
    </label>

    <fieldset class="stack">
      <legend>{{ t('puzzles.hints') }}</legend>
      <p class="hint">{{ t('puzzles.hintsHint') }}</p>
      <ol v-if="puzzle.hints.length > 0" class="stack hints">
        <li v-for="(hint, i) in puzzle.hints" :key="hint.id" class="row">
          <textarea
            v-model="hint.text"
            rows="1"
            class="grow"
            :aria-label="t('puzzles.hintNumber', { n: i + 1 })"
            @blur="tidyHint(i)"
          />
          <button
            class="small"
            type="button"
            :disabled="i === 0"
            :aria-label="t('puzzles.moveUp')"
            @click="moveHint(i, -1)"
          >
            ↑
          </button>
          <button
            class="small"
            type="button"
            :disabled="i === puzzle.hints.length - 1"
            :aria-label="t('puzzles.moveDown')"
            @click="moveHint(i, 1)"
          >
            ↓
          </button>
          <button
            class="small danger"
            type="button"
            :aria-label="t('common.remove')"
            @click="puzzle.hints.splice(i, 1)"
          >
            ×
          </button>
        </li>
      </ol>
      <form class="row" @submit.prevent="addHint">
        <input v-model="newHint" class="grow" :placeholder="t('puzzles.newHint')" />
        <button class="small" type="submit" :disabled="!newHint.trim()">
          {{ t('puzzles.addHint') }}
        </button>
      </form>
    </fieldset>

    <label class="field">
      <span>{{ t('puzzles.notes') }}</span>
      <textarea v-model="puzzle.notes" rows="3" :placeholder="t('puzzles.notesHint')" />
    </label>
    <div class="row">
      <button class="danger" type="button" @click="emit('remove')">
        {{ t('puzzles.delete') }}
      </button>
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

.hints {
  margin: 0;
  padding-left: 1.5rem;
}

.hints li {
  gap: 0.4rem;
  align-items: start;
}

.grow {
  flex: 1 1 10rem;
  min-width: 0;
}

.image-row {
  align-items: center;
}

.thumb {
  width: 8rem;
  max-height: 8rem;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}
</style>
