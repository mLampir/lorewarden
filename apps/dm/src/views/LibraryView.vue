<script setup lang="ts">
import {
  BookOpen,
  ClipboardList,
  FilePlus,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CreateAdventureDialog, { type CreateMode } from '../components/CreateAdventureDialog.vue';
import { onAdventureChange, onConnected } from '../lib/server';
import { type AdventureSummary, deleteAdventure, listAdventures } from '../storage/database';

const { t, d } = useI18n();

const adventures = ref<AdventureSummary[]>([]);
const loaded = ref(false);
/**
 * Typed by hand: with InstanceType<typeof CreateAdventureDialog> the linter turns the import into
 * a type import, and the template no longer finds the component.
 */
const createDialog = ref<{ open(mode: CreateMode): void; loadExample(): Promise<void> }>();

/** What went wrong when the server did not take a change. */
const failure = ref<'saveFailed' | 'deleteFailed'>();

/** Runs a change on the server and shows a message instead of failing silently. */
async function attempt(kind: 'saveFailed' | 'deleteFailed', action: () => Promise<void>) {
  failure.value = undefined;
  try {
    await action();
  } catch {
    failure.value = kind;
  }
}

async function refresh() {
  try {
    adventures.value = await listAdventures();
    loaded.value = true;
  } catch {
    // The server is not running; the banner says so and the list loads once it is back.
  }
}

onMounted(refresh);
// Adventures an AI assistant or another tab creates appear without reloading the page.
const stopChanges = onAdventureChange(() => void refresh());
const stopConnected = onConnected(() => void refresh());
onBeforeUnmount(() => {
  stopChanges();
  stopConnected();
});

function openCreate(mode: CreateMode) {
  failure.value = undefined;
  createDialog.value?.open(mode);
}

/** Loads the example adventure from the start page of an empty library. */
function loadExample() {
  return attempt('saveFailed', async () => {
    await createDialog.value?.loadExample();
  });
}

async function remove(summary: AdventureSummary) {
  if (!window.confirm(t('library.deleteConfirm', { title: summary.title }))) return;
  await attempt('deleteFailed', async () => {
    await deleteAdventure(summary.id);
    await refresh();
  });
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ t('library.heading') }}</h1>
        <p class="muted">{{ t('app.tagline') }}</p>
      </div>
      <div v-if="adventures.length > 0" class="row">
        <button @click="openCreate('import')">
          <Upload aria-hidden="true" />{{ t('library.import') }}
        </button>
        <button class="primary" @click="openCreate('blank')">
          <Plus aria-hidden="true" />{{ t('library.new') }}
        </button>
      </div>
    </header>

    <p v-if="failure" class="error" role="alert">{{ t(`library.${failure}`) }}</p>

    <section v-if="loaded && adventures.length === 0" class="card empty">
      <span class="empty-icon" aria-hidden="true"><BookOpen :size="28" /></span>
      <h2>{{ t('library.emptyHeading') }}</h2>
      <p class="muted">{{ t('library.empty') }}</p>
      <div class="starts">
        <button class="start" @click="openCreate('blank')">
          <FilePlus aria-hidden="true" />
          <strong>{{ t('library.modes.blank') }}</strong>
          <span class="hint">{{ t('library.modeHints.blank') }}</span>
        </button>
        <button class="start" @click="openCreate('ai')">
          <Sparkles aria-hidden="true" />
          <strong>{{ t('library.modes.ai') }}</strong>
          <span class="hint">{{ t('library.modeHints.ai') }}</span>
        </button>
        <button class="start" @click="loadExample">
          <BookOpen aria-hidden="true" />
          <strong>{{ t('library.modes.example') }}</strong>
          <span class="hint">{{ t('library.modeHints.example') }}</span>
        </button>
      </div>
      <button class="ghost" @click="openCreate('import')">
        <Upload aria-hidden="true" />{{ t('library.modes.import') }}
      </button>
    </section>

    <ul v-else class="list adventures">
      <li v-for="adventure in adventures" :key="adventure.id" class="card adventure">
        <div class="adventure-text">
          <h2>
            <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }">
              {{ adventure.title }}
            </RouterLink>
          </h2>
          <p class="hint">
            {{ t('library.sceneCount', adventure.sceneCount) }} ·
            {{ t('library.updated', { date: d(new Date(adventure.updatedAt), 'short') }) }}
          </p>
        </div>
        <div class="row actions">
          <RouterLink :to="{ name: 'play', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button class="primary" @click="navigate">
                <Play aria-hidden="true" />{{ t('library.play') }}
              </button>
            </template>
          </RouterLink>
          <RouterLink :to="{ name: 'prep', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button @click="navigate">
                <ClipboardList aria-hidden="true" />{{ t('library.prepare') }}
              </button>
            </template>
          </RouterLink>
          <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button @click="navigate"><Pencil aria-hidden="true" />{{ t('library.edit') }}</button>
            </template>
          </RouterLink>
          <button
            class="ghost icon-only delete"
            :title="t('common.delete')"
            :aria-label="`${t('common.delete')}: ${adventure.title}`"
            @click="remove(adventure)"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <p class="hint local-note">{{ t('library.localNote') }}</p>

    <CreateAdventureDialog ref="createDialog" @stored="refresh" />
  </main>
</template>

<style scoped>
.adventures {
  display: grid;
  gap: 0.75rem;
}

.adventure {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem 1.5rem;
  padding: 1.1rem 1.25rem;
}

.adventure h2 {
  margin: 0 0 0.15rem;
  font-size: 1.15rem;
}

.adventure h2 a {
  color: inherit;
  text-decoration: none;
}

.adventure h2 a:hover {
  color: var(--accent);
}

.delete:hover:not(:disabled) {
  color: var(--danger);
}

.local-note {
  margin-top: 1.5rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1.25rem;
  text-align: center;
}

.empty h2,
.empty p {
  margin: 0;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.starts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  width: 100%;
  max-width: 44rem;
  margin: 1rem 0 0.5rem;
}

.start {
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.35rem;
  padding: 1.1rem 1rem;
  border-radius: var(--radius);
  text-align: center;
}

.start svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--accent);
}

.start .hint {
  font-weight: 400;
}
</style>
