<script setup lang="ts">
import {
  buildTermIndex,
  formatChallengeRating,
  prepSheet,
  reviewAdventure,
  type Session,
} from '@lorewarden/core';
import {
  ArrowRight,
  ChevronLeft,
  DoorOpen,
  Flag,
  Map as MapIcon,
  Pencil,
  Play,
  Printer,
  Puzzle,
  RotateCcw,
  Search,
  Signpost,
  Sparkles,
  Swords,
  Target,
  TriangleAlert,
  Users,
} from '@lucide/vue';
import { computed, provide, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import NotesText from '../components/NotesText.vue';
import TermText from '../components/TermText.vue';
import { useAdventure } from '../composables/useAdventure';
import { useSettings } from '../composables/useSettings';
import { describeHint } from '../lib/review';
import { termIndexKey } from '../lib/terms';
import { getLatestSession } from '../storage/database';

/** The whole adventure on one page, to read before the session and to print. */
const props = defineProps<{ id: string }>();
const { t, d } = useI18n();
const { term } = useSettings();
const router = useRouter();

const { adventure, loading } = useAdventure(toRef(props, 'id'));
provide(
  termIndexKey,
  computed(() => (adventure.value ? buildTermIndex(adventure.value) : undefined)),
);

const sheet = computed(() => (adventure.value ? prepSheet(adventure.value) : undefined));
const hints = computed(() => {
  const value = adventure.value;
  return value ? reviewAdventure(value).map((hint) => describeHint(t, value, hint)) : [];
});
const startFeatures = computed(
  () => sheet.value?.start?.features.filter((f) => f.trim() !== '') ?? [],
);

/** The session live mode would continue, so the game master can choose to start afresh. */
const latest = ref<Session>();
watch(
  () => adventure.value?.id,
  async (id) => {
    latest.value = id ? await getLatestSession(id).catch(() => undefined) : undefined;
  },
  { immediate: true },
);

function play(fresh: boolean) {
  void router.push({
    name: 'play',
    params: { id: props.id },
    query: fresh ? { session: 'new' } : {},
  });
}

function stats(monster: { ac?: number; hp?: number; cr: number }): string {
  return [
    monster.ac !== undefined ? `${term('statBlock.ac')} ${monster.ac}` : '',
    monster.hp !== undefined ? `${term('statBlock.hp')} ${monster.hp}` : '',
    `${term('statBlock.cr')} ${formatChallengeRating(monster.cr)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function print() {
  window.print();
}
</script>

<template>
  <main class="page prep">
    <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
    <div v-else-if="!adventure || !sheet" class="stack">
      <p>{{ t('common.notFound') }}</p>
      <RouterLink to="/">{{ t('common.backToLibrary') }}</RouterLink>
    </div>
    <template v-else>
      <header class="page-header">
        <div>
          <RouterLink to="/" class="back no-print">
            <ChevronLeft aria-hidden="true" />{{ t('common.backToLibrary') }}
          </RouterLink>
          <h1>{{ adventure.title }}</h1>
          <p class="muted">
            {{ t('prep.party', { size: adventure.party.size, level: adventure.party.level }) }}
          </p>
        </div>
        <div class="row no-print">
          <button @click="print"><Printer aria-hidden="true" />{{ t('prep.print') }}</button>
          <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button @click="navigate"><Pencil aria-hidden="true" />{{ t('library.edit') }}</button>
            </template>
          </RouterLink>
        </div>
      </header>

      <div class="stack sheet">
        <section v-if="hints.length > 0" class="card no-print">
          <h2 class="section-title"><TriangleAlert aria-hidden="true" />{{ t('prep.check') }}</h2>
          <ul class="review">
            <li v-for="(hint, i) in hints" :key="i">{{ hint }}</li>
          </ul>
        </section>

        <section v-if="adventure.summary" class="card">
          <h2 class="section-title"><Target aria-hidden="true" />{{ t('live.summary') }}</h2>
          <NotesText class="secret" :text="adventure.summary" />
          <p v-if="adventure.party.characters" class="characters">
            <span class="label">{{ t('prep.characters') }}</span>
            <TermText :text="adventure.party.characters" />
          </p>
        </section>

        <section v-if="sheet.start" class="card">
          <h2 class="section-title"><Flag aria-hidden="true" />{{ t('prep.strongStart') }}</h2>
          <h3>{{ sheet.start.title }}</h3>
          <p v-if="sheet.start.purpose" class="glance-line">
            <Target aria-hidden="true" /><TermText :text="sheet.start.purpose" />
          </p>
          <ul v-if="startFeatures.length > 0" class="features" :aria-label="t('live.features')">
            <li v-for="(feature, i) in startFeatures" :key="i"><TermText :text="feature" /></li>
          </ul>
          <p v-if="sheet.start.wayOut" class="glance-line">
            <Signpost aria-hidden="true" /><TermText :text="sheet.start.wayOut" />
          </p>
          <blockquote v-if="sheet.start.description" class="read-aloud">
            <TermText :text="sheet.start.description" />
          </blockquote>
        </section>

        <section v-if="sheet.scenes.length > 0" class="card">
          <h2 class="section-title">
            <MapIcon aria-hidden="true" />{{ t('editor.tabs.scenes') }}
            <span class="count">{{ sheet.scenes.length }}</span>
          </h2>
          <ol class="entries">
            <li v-for="entry in sheet.scenes" :key="entry.scene.id">
              <p class="entry-title">
                <strong>{{ entry.scene.title }}</strong>
                <span v-if="entry.start" class="tag">{{ t('prep.start') }}</span>
                <span v-if="entry.scene.ending" class="tag">{{ t('prep.ending') }}</span>
                <span v-if="entry.scene.levelUp" class="tag">{{ t('prep.levelUp') }}</span>
                <span v-if="!entry.reachable" class="tag warn">{{ t('prep.unreachable') }}</span>
              </p>
              <NotesText v-if="entry.line" :text="entry.line" />
              <ul v-if="entry.exits.length > 0" class="exits" :aria-label="t('live.exits')">
                <li v-for="(exit, i) in entry.exits" :key="i">
                  <DoorOpen aria-hidden="true" />
                  <span>
                    {{ exit.label }} <ArrowRight class="arrow" aria-hidden="true" />
                    {{ exit.target }}
                    <span v-if="exit.condition" class="muted">({{ exit.condition }})</span>
                  </span>
                </li>
              </ul>
            </li>
          </ol>
        </section>

        <section v-if="sheet.clues.length > 0" class="card">
          <h2 class="section-title">
            <Search aria-hidden="true" />{{ t('live.clues') }}
            <span class="count">{{ sheet.clues.length }}</span>
          </h2>
          <ul class="entries">
            <li v-for="{ clue, scenes, leads } in sheet.clues" :key="clue.id">
              <p><TermText :text="clue.text" /></p>
              <ul v-if="leads.length > 0" class="leads">
                <li v-for="(lead, i) in leads" :key="i">
                  <TermText :text="lead.text" />
                  <span v-if="lead.where" class="muted"> · {{ lead.where }}</span>
                </li>
              </ul>
              <p class="hint">
                {{ scenes.length > 0 ? t('prep.foundIn', { scenes: scenes.join(', ') }) : t('common.inNoScene') }}
              </p>
            </li>
          </ul>
        </section>

        <section v-if="sheet.npcs.length > 0" class="card">
          <h2 class="section-title">
            <Users aria-hidden="true" />{{ t('live.npcs') }}
            <span class="count">{{ sheet.npcs.length }}</span>
          </h2>
          <ul class="entries">
            <li v-for="{ npc, scenes } in sheet.npcs" :key="npc.id">
              <p class="entry-title">
                <strong>{{ npc.name }}</strong>
                <span v-if="npc.role" class="muted">{{ npc.role }}</span>
              </p>
              <p v-if="npc.voice"><span class="label">{{ t('prep.voice') }}</span>{{ npc.voice }}</p>
              <NotesText v-if="npc.notes" class="secret" :text="npc.notes" />
              <p v-if="scenes.length > 0" class="hint">
                {{ t('common.appearsIn', { scenes: scenes.join(', ') }) }}
              </p>
            </li>
          </ul>
        </section>

        <section v-if="sheet.encounters.length > 0" class="card">
          <h2 class="section-title">
            <Swords aria-hidden="true" />{{ t('live.encounters') }}
            <span class="count">{{ sheet.encounters.length }}</span>
          </h2>
          <ul class="entries">
            <li v-for="encounter in sheet.encounters" :key="encounter.id">
              <p class="entry-title">
                <strong>{{ encounter.scene ?? t('common.inNoScene') }}</strong>
                <span v-if="encounter.difficulty" class="muted">
                  {{ t('live.difficulty', { difficulty: encounter.difficulty }) }}
                </span>
              </p>
              <ul class="monsters">
                <li v-for="(monster, i) in encounter.monsters" :key="i">
                  <span>{{ monster.count }}× {{ monster.name }}</span>
                  <span class="muted">{{ stats(monster) }}</span>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <section v-if="sheet.puzzles.length > 0" class="card">
          <h2 class="section-title">
            <Puzzle aria-hidden="true" />{{ t('live.puzzles') }}
            <span class="count">{{ sheet.puzzles.length }}</span>
          </h2>
          <ul class="entries">
            <li v-for="{ puzzle, scene } in sheet.puzzles" :key="puzzle.id">
              <p class="entry-title">
                <strong>{{ puzzle.title }}</strong>
                <span v-if="scene" class="muted">{{ scene }}</span>
              </p>
              <blockquote v-if="puzzle.prompt" class="read-aloud">
                <TermText :text="puzzle.prompt" />
              </blockquote>
              <p v-if="puzzle.solution" class="secret">
                <span class="label">{{ t('live.solution') }}</span><TermText :text="puzzle.solution" />
              </p>
            </li>
          </ul>
        </section>

        <section class="card start no-print">
          <h2 class="section-title"><Sparkles aria-hidden="true" />{{ t('prep.ready') }}</h2>
          <template v-if="latest">
            <p class="hint">
              {{ t('prep.lastSession', { date: d(new Date(latest.startedAt), 'short') }) }}
            </p>
            <div class="row">
              <button class="primary" @click="play(true)">
                <Play aria-hidden="true" />{{ t('prep.startNew') }}
              </button>
              <button @click="play(false)">
                <RotateCcw aria-hidden="true" />{{ t('prep.continue') }}
              </button>
            </div>
          </template>
          <div v-else class="row">
            <button class="primary" @click="play(false)">
              <Play aria-hidden="true" />{{ t('prep.startSession') }}
            </button>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.prep {
  max-width: 52rem;
}

.sheet h3 {
  margin: 0.6rem 0 0.4rem;
}

.section-title {
  margin-bottom: 0.6rem;
}

.label {
  margin-right: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.characters {
  margin: 0.6rem 0 0;
}

.review {
  margin: 0;
  padding-left: 1.15rem;
}

.glance-line {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.3rem 0;
}

.glance-line svg,
.exits svg {
  flex: none;
  width: 1rem;
  height: 1rem;
  margin-top: 0.2rem;
  color: var(--accent);
}

.features {
  margin: 0.3rem 0;
  padding-left: 1.6rem;
}

.read-aloud {
  margin: 0.5rem 0 0;
  padding: 0.6rem 0.9rem;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--surface-2);
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
  line-height: 1.55;
  white-space: pre-line;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

ol.entries {
  counter-reset: scene;
}

.entries > li {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  break-inside: avoid;
}

.entries > li + li {
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}

.entries p {
  margin: 0;
}

.leads {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.875rem;
}

.entry-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
}

ol.entries .entry-title::before {
  counter-increment: scene;
  content: counter(scene) ".";
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.tag.warn {
  color: var(--danger);
}

.exits,
.monsters {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.925rem;
}

.exits li {
  display: flex;
  gap: 0.4rem;
}

.arrow {
  width: 0.85rem;
  height: 0.85rem;
  vertical-align: -0.1rem;
  color: var(--muted);
}

.monsters li {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.75rem;
}

.start {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.start .section-title {
  margin: 0;
}

.start .hint {
  margin: 0;
}

@media print {
  .prep {
    max-width: none;
    padding: 0;
  }

  .sheet {
    gap: 0.5rem;
  }

  .card {
    padding: 0.5rem 0;
    border: none;
    box-shadow: none;
  }

  .read-aloud,
  .secret {
    background: none;
  }

  /* Scoped rules such as .start would win over the global one. */
  .no-print {
    display: none;
  }
}
</style>
