<script setup lang="ts">
import {
  buildWhatHappenedPrompt,
  type HistoryAdventure,
  type LogEntry,
  type Party,
  type PartyHistory,
  setWhatHappened,
} from '@lorewarden/core';
import { History, Puzzle as PuzzleIcon, Search, Sparkles } from '@lucide/vue';
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getPartyHistory } from '../storage/database';

/**
 * The adventures a party played, the latest first: the game master's note on what happened in
 * each, and its sessions to read again. The note is saved with the party.
 */
const party = defineModel<Party>('party', { required: true });
const props = defineProps<{ focus?: string }>();
const { t, d } = useI18n();

const history = ref<PartyHistory>();
const failed = ref(false);
/** Adventure whose prompt was copied, or whose prompt is shown for copying by hand. */
const copied = ref<string>();
const manual = ref<{ adventureId: string; prompt: string }>();

async function load(partyId: string) {
  failed.value = false;
  try {
    const loaded = await getPartyHistory(partyId);
    // The party may have changed while the history loaded.
    if (party.value.id !== partyId) return;
    history.value = loaded;
  } catch {
    failed.value = true;
  }
}

watch(
  () => party.value.id,
  async (id) => {
    history.value = undefined;
    copied.value = undefined;
    manual.value = undefined;
    await load(id);
    if (!props.focus) return;
    await nextTick();
    const target = document.getElementById(`chronicle-${props.focus}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.querySelector('textarea')?.focus({ preventScroll: true });
  },
  { immediate: true },
);

/** The note as edited here, which may be newer than the one the history was loaded with. */
function note(adventure: HistoryAdventure): string {
  const entry = party.value.chronicle.find((e) => e.adventureId === adventure.adventureId);
  return entry?.whatHappened ?? adventure.whatHappened;
}

function write(adventure: HistoryAdventure, text: string) {
  party.value = setWhatHappened(party.value, adventure, text);
}

/** Copies instructions for the AI; shows them for manual copying if the clipboard is blocked. */
async function copyPrompt(adventure: HistoryAdventure) {
  const prompt = buildWhatHappenedPrompt(adventure);
  manual.value = undefined;
  try {
    await navigator.clipboard.writeText(prompt);
    copied.value = adventure.adventureId;
  } catch {
    copied.value = undefined;
    manual.value = { adventureId: adventure.adventureId, prompt };
  }
}

function lastPlayed(adventure: HistoryAdventure): string {
  const latest = adventure.sessions[0];
  if (!latest) return t('chronicle.noSessions');
  return t(
    'chronicle.sessions',
    { count: adventure.sessions.length, date: d(new Date(latest.startedAt), 'long') },
    adventure.sessions.length,
  );
}

function line(entry: LogEntry) {
  return entry.kind === 'scene' ? t('log.movedTo', { scene: entry.text }) : entry.text;
}
</script>

<template>
  <section class="card stack" :aria-label="t('chronicle.heading')">
    <h2 class="section-title">
      <History aria-hidden="true" />{{ t('chronicle.heading') }}
      <span v-if="history && history.adventures.length > 0" class="count">
        {{ history.adventures.length }}
      </span>
    </h2>
    <p v-if="failed" class="error" role="alert">{{ t('chronicle.loadFailed') }}</p>
    <p v-else-if="!history" class="muted">{{ t('common.loading') }}</p>
    <p v-else-if="history.adventures.length === 0" class="hint">{{ t('chronicle.empty') }}</p>
    <article
      v-for="adventure in history?.adventures ?? []"
      :id="`chronicle-${adventure.adventureId}`"
      :key="adventure.adventureId"
      class="adventure stack"
    >
      <header class="adventure-header">
        <h3>
          <RouterLink
            v-if="adventure.exists"
            :to="{ name: 'prep', params: { id: adventure.adventureId } }"
          >
            {{ adventure.title }}
          </RouterLink>
          <template v-else>{{ adventure.title }}</template>
        </h3>
        <span class="hint">
          {{ adventure.exists ? lastPlayed(adventure) : t('chronicle.deleted') }}
        </span>
      </header>

      <label class="field">
        <span>{{ t('chronicle.whatHappened') }}</span>
        <textarea
          :value="note(adventure)"
          rows="4"
          maxlength="4000"
          :placeholder="t('chronicle.whatHappenedPlaceholder')"
          @input="write(adventure, ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <div v-if="adventure.sessions.length > 0" class="row">
        <button class="small" @click="copyPrompt(adventure)">
          <Sparkles aria-hidden="true" />{{ t('chronicle.suggest') }}
        </button>
        <span v-if="copied === adventure.adventureId" class="hint" role="status">
          {{ t('chronicle.copied') }}
        </span>
      </div>
      <label v-if="manual?.adventureId === adventure.adventureId" class="field">
        <span>{{ t('claude.copyManually') }}</span>
        <textarea
          :value="manual.prompt"
          rows="5"
          readonly
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
      </label>

      <details v-for="session in adventure.sessions" :key="session.id" class="session">
        <summary>
          <span>{{ d(new Date(session.startedAt), 'short') }}</span>
          <span v-if="session.lastScene" class="hint">
            {{
              session.lastScene.ending
                ? t('chronicle.ended', { scene: session.lastScene.title })
                : t('chronicle.stopped', { scene: session.lastScene.title })
            }}
          </span>
        </summary>
        <div class="stack session-body">
          <div v-if="session.foundClues.length > 0" class="stack">
            <h4 class="section-title"><Search aria-hidden="true" />{{ t('chronicle.clues') }}</h4>
            <ul>
              <li v-for="(clue, i) in session.foundClues" :key="i">{{ clue }}</li>
            </ul>
          </div>
          <div v-if="session.solvedPuzzles.length > 0" class="stack">
            <h4 class="section-title">
              <PuzzleIcon aria-hidden="true" />{{ t('chronicle.puzzles') }}
            </h4>
            <ul>
              <li v-for="(title, i) in session.solvedPuzzles" :key="i">{{ title }}</li>
            </ul>
          </div>
          <ol v-if="session.log.length > 0" class="list entries" :aria-label="t('log.heading')">
            <li v-for="entry in session.log" :key="entry.id" :class="['entry', entry.kind]">
              <time :datetime="entry.at" class="hint">{{ d(new Date(entry.at), 'time') }}</time>
              <span class="text">{{ line(entry) }}</span>
            </li>
          </ol>
          <p v-else class="hint">{{ t('chronicle.emptyLog') }}</p>
        </div>
      </details>
    </article>
  </section>
</template>

<style scoped>
.adventure {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  scroll-margin-top: 4.25rem;
}

.adventure-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
}

.adventure-header h3 {
  margin: 0;
}

.session summary {
  cursor: pointer;
  font-weight: 600;
}

.session summary .hint {
  margin-left: 0.6rem;
  font-weight: 400;
}

.session-body {
  padding: 0.5rem 0 0 1rem;
}

.session-body ul {
  margin: 0;
  padding-left: 1.25rem;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.entry {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem;
  align-items: start;
}

.entry time {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.entry.scene .text {
  font-weight: 600;
  color: var(--accent);
}

.text {
  white-space: pre-line;
}
</style>
