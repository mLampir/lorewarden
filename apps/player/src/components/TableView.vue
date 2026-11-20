<script setup lang="ts">
import type { PlayerView } from '@lorewarden/core';
import { Hourglass, Swords, X } from '@lucide/vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TableStatus } from '../lib/table';
import { useTerms } from '../lib/terms';

/**
 * The table once the phone has joined: the prompt for initiative while the game master asks for
 * it, everything revealed to this player, the newest highlighted, and images to enlarge.
 */
const props = defineProps<{
  status: TableStatus;
  view: PlayerView | undefined;
  /** Sends the initiative to the game master; resolves to whether it arrived. */
  sendInitiative: (value: number) => Promise<boolean>;
}>();
const { t, d } = useI18n();
const term = useTerms(() => props.view?.termsLanguage);

// Highlight what has just been revealed and let the phone buzz. The first view after joining
// shows what the table already has, so nothing in it counts as new.
const fresh = ref(new Set<string>());
let known: Set<string> | undefined;
let freshTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.view,
  (value) => {
    if (!value) {
      known = undefined;
      clearTimeout(freshTimer);
      fresh.value = new Set();
      return;
    }
    const ids = new Set(value.reveals.map((r) => r.id));
    const added = known ? [...ids].filter((id) => !known?.has(id)) : [];
    known = ids;
    if (added.length === 0) return;
    fresh.value = new Set(added);
    navigator.vibrate?.(200);
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => {
      fresh.value = new Set();
    }, 4000);
  },
);
onUnmounted(() => clearTimeout(freshTimer));

// The enlarged image closes when the game master hides it again; a replaced image is shown new.
const enlargedId = ref<string>();
const enlarged = computed(() =>
  props.view?.reveals.find((r) => r.id === enlargedId.value && r.imageUrl),
);
watch(enlarged, (value) => {
  if (!value) enlargedId.value = undefined;
});
function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') enlargedId.value = undefined;
}
onMounted(() => window.addEventListener('keydown', closeOnEscape));
onUnmounted(() => window.removeEventListener('keydown', closeOnEscape));

// The game master asks for initiative: the prompt stays at the top until combat is under way.
const initiative = ref<number>();
const editingInitiative = ref(false);
const sendingInitiative = ref(false);
const initiativeFailed = ref(false);
const initiativeInput = ref<HTMLInputElement>();

watch(
  () => props.view?.initiative?.at,
  (at, before) => {
    if (!at || at === before) return;
    initiative.value = undefined;
    editingInitiative.value = false;
    initiativeFailed.value = false;
    navigator.vibrate?.(200);
  },
);

async function submitInitiative() {
  const value = initiative.value;
  if (value === undefined || !Number.isInteger(value)) return;
  sendingInitiative.value = true;
  initiativeFailed.value = !(await props.sendInitiative(value));
  sendingInitiative.value = false;
  if (!initiativeFailed.value) editingInitiative.value = false;
}

async function changeInitiative() {
  initiative.value = props.view?.initiative?.value;
  editingInitiative.value = true;
  await nextTick();
  initiativeInput.value?.focus();
}
</script>

<template>
    <p v-if="status === 'connecting'" class="notice">{{ t('table.connecting') }}</p>
    <p v-else-if="status === 'offline'" class="notice error" role="status">
      {{ t('table.offline') }}
    </p>
    <p v-else-if="status === 'waiting'" class="notice">{{ t('table.waiting') }}</p>

    <section
      v-if="view?.initiative"
      class="card initiative"
      :aria-label="term('table.initiative.heading')"
    >
      <h2 class="initiative-head">
        <Swords aria-hidden="true" :size="18" />{{ term('table.initiative.heading') }}
      </h2>
      <p
        v-if="view.initiative.value !== undefined && !editingInitiative"
        class="initiative-sent"
        role="status"
      >
        {{ term('table.initiative.sent', { value: view.initiative.value }) }}
        <button class="link" type="button" @click="changeInitiative">
          {{ t('table.initiative.change') }}
        </button>
      </p>
      <form v-else class="initiative-form" @submit.prevent="submitInitiative">
        <p class="muted">{{ t('table.initiative.hint') }}</p>
        <div class="initiative-row">
          <input
            ref="initiativeInput"
            v-model.number="initiative"
            type="number"
            inputmode="numeric"
            min="-10"
            max="99"
            required
            :aria-label="term('table.initiative.value')"
          />
          <button class="primary" type="submit" :disabled="sendingInitiative">
            {{ t('table.initiative.send') }}
          </button>
        </div>
        <p v-if="initiativeFailed" class="error" role="alert">
          {{ t('table.initiative.failed') }}
        </p>
      </form>
    </section>

    <div v-if="view && view.reveals.length === 0" class="card empty">
      <span class="empty-icon" aria-hidden="true"><Hourglass :size="24" /></span>
      <p class="muted">{{ t('table.empty') }}</p>
    </div>
    <ul v-if="view" class="reveals">
      <li
        v-for="reveal in view.reveals"
        :key="reveal.id"
        class="card reveal"
        :class="{ fresh: fresh.has(reveal.id) }"
      >
        <div class="reveal-head">
          <span v-if="reveal.tag" class="badge quiet">{{ t(`table.${reveal.tag}`) }}</span>
          <h2>{{ reveal.title }}</h2>
          <span v-if="reveal.solved" class="badge solved">{{ t('table.solved') }}</span>
          <span v-if="reveal.personal" class="badge">{{ t('table.personal') }}</span>
          <span v-if="fresh.has(reveal.id)" class="badge new">{{ t('table.new') }}</span>
          <time class="muted" :datetime="reveal.at">{{ d(new Date(reveal.at), 'time') }}</time>
        </div>
        <button
          v-if="reveal.imageUrl"
          class="image-button"
          type="button"
          :aria-label="t('table.enlarge', { title: reveal.title })"
          @click="enlargedId = reveal.id"
        >
          <img :src="reveal.imageUrl" :alt="reveal.title" loading="lazy" />
        </button>
        <p v-if="reveal.text" class="text">{{ reveal.text }}</p>
      </li>
    </ul>
  <div
    v-if="enlarged"
    class="viewer"
    role="dialog"
    :aria-label="enlarged.title"
    @click="enlargedId = undefined"
  >
    <img :src="enlarged.imageUrl" :alt="enlarged.title" />
    <button class="close" type="button" @click="enlargedId = undefined">
      <X aria-hidden="true" :size="18" />{{ t('table.close') }}
    </button>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1.25rem;
  text-align: center;
}

.empty p {
  margin: 0;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.initiative {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft), var(--shadow);
}

.initiative-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.initiative-head svg {
  color: var(--accent);
}

.initiative p {
  margin: 0;
}

.initiative-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.initiative-row {
  display: flex;
  gap: 0.5rem;
}

.initiative-row input {
  width: 6rem;
  font-size: 1.4rem;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.initiative-row .primary {
  flex: 1;
}

.initiative-sent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.reveals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reveal {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: box-shadow 0.3s;
}

.reveal.fresh {
  box-shadow: 0 0 0 3px var(--accent);
}

.reveal-head {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.reveal-head time {
  margin-left: auto;
  font-size: 0.85rem;
}

.badge {
  font-size: 0.8rem;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
}

.badge.quiet {
  background: none;
  color: var(--accent);
  border: 1px solid var(--accent);
}

.badge.new {
  background: var(--focus);
}

.badge.solved {
  background: var(--ok);
  color: var(--accent-text);
}

.image-button {
  padding: 0;
  border: none;
  background: none;
}

.image-button img {
  display: block;
  width: 100%;
  border-radius: var(--radius);
}

.text {
  margin: 0;
  white-space: pre-line;
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
  font-size: 1.1rem;
  line-height: 1.6;
}

.viewer {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.92);
}

.viewer img {
  /* The full size, so drawings without a size of their own fill the screen as well. */
  width: 100%;
  height: 100%;
  object-fit: contain;
  touch-action: pinch-zoom;
}

.viewer .close {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}

</style>
