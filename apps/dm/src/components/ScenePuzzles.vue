<script setup lang="ts">
import { type Adventure, type Puzzle, type Session, togglePuzzleSolved } from '@lorewarden/core';
import { Puzzle as PuzzleIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Table } from '../composables/useTable';
import MapViewer from './MapViewer.vue';
import NotesText from './NotesText.vue';
import TermText from './TermText.vue';

const session = defineModel<Session>('session', { required: true });
const props = defineProps<{ adventure: Adventure; puzzles: Puzzle[]; table: Table }>();
const { t } = useI18n();

const tableOn = props.table.enabled;

const shownImage = ref<string>();
const shownAsset = computed(() => props.adventure.assets.find((a) => a.id === shownImage.value));

function image(puzzle: Puzzle) {
  return props.adventure.assets.find((asset) => asset.id === puzzle.assetId);
}

function isSolved(puzzle: Puzzle): boolean {
  return session.value.solvedPuzzleIds.includes(puzzle.id);
}

/** Hints already on the players' phones, so the game master knows which one comes next. */
const shownHints = computed(
  () =>
    new Set(
      session.value.revealed.flatMap((r) =>
        r.kind === 'puzzleHint' && r.hintId ? [r.hintId] : [],
      ),
    ),
);

const shownPuzzles = computed(
  () =>
    new Set(
      session.value.revealed.flatMap((r) =>
        r.kind === 'puzzle' && r.puzzleId ? [r.puzzleId] : [],
      ),
    ),
);
</script>

<template>
  <div class="stack">
    <h3 class="section-title"><PuzzleIcon aria-hidden="true" />{{ t('live.puzzles') }}</h3>
    <article v-for="puzzle in puzzles" :key="puzzle.id" class="stack puzzle">
      <div class="row spread">
        <label class="inline solved" :class="{ done: isSolved(puzzle) }">
          <input
            type="checkbox"
            :checked="isSolved(puzzle)"
            @change="session = togglePuzzleSolved(session, puzzle.id)"
          />
          <strong>{{ puzzle.title }}</strong>
          <small class="muted">{{ isSolved(puzzle) ? t('live.solved') : t('live.unsolved') }}</small>
        </label>
        <button
          v-if="tableOn"
          class="small"
          @click="table.reveal({ kind: 'puzzle', puzzleId: puzzle.id })"
        >
          {{ shownPuzzles.has(puzzle.id) ? t('table.showAgain') : t('table.showToPlayers') }}
        </button>
      </div>
      <blockquote v-if="puzzle.prompt" class="read-aloud">
        <TermText :text="puzzle.prompt" />
      </blockquote>
      <button
        v-if="image(puzzle)"
        class="thumb-button"
        :aria-label="t('live.showHandout', { title: puzzle.title })"
        @click="shownImage = puzzle.assetId"
      >
        <img :src="image(puzzle)?.src" :alt="puzzle.title" class="thumb" />
      </button>
      <p v-if="puzzle.solution" class="secret">
        <strong>{{ t('live.solution') }}</strong> <TermText :text="puzzle.solution" />
      </p>
      <NotesText v-if="puzzle.notes" class="secret" :text="puzzle.notes" />
      <ol v-if="puzzle.hints.length > 0" class="list stack hints">
        <li v-for="(hint, i) in puzzle.hints" :key="hint.id" :class="{ given: shownHints.has(hint.id) }">
          <span>
            <small class="muted">{{ t('live.hintNumber', { n: i + 1 }) }}</small>
            {{ hint.text }}
          </span>
          <button
            v-if="tableOn"
            class="small"
            @click="table.reveal({ kind: 'puzzleHint', puzzleId: puzzle.id, hintId: hint.id })"
          >
            {{ shownHints.has(hint.id) ? t('table.showAgain') : t('table.showToPlayers') }}
          </button>
        </li>
      </ol>
    </article>
    <MapViewer v-if="shownAsset" :images="[shownAsset]" @close="shownImage = undefined" />
  </div>
</template>

<style scoped>
.puzzle {
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.spread {
  justify-content: space-between;
  align-items: center;
}

.solved {
  gap: 0.4rem;
  align-items: baseline;
}

.solved.done strong {
  text-decoration: line-through;
  color: var(--muted);
}

.read-aloud {
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-left: 4px solid var(--accent);
  font-style: italic;
  white-space: pre-line;
}

.secret {
  margin: 0;
  white-space: pre-line;
}

.thumb-button {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
}

.thumb {
  display: block;
  /* A fixed width, because drawings without a size of their own would shrink to nothing. */
  width: 12rem;
  max-height: 12rem;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.hints li {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.hints li.given span {
  color: var(--muted);
}
</style>
