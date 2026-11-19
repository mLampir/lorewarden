<script setup lang="ts">
import {
  type Adventure,
  buildWhatHappenedPrompt,
  draftWhatHappened,
  type Party,
  type Session,
  setWhatHappened,
} from '@lorewarden/core';
import { Check, History, RotateCcw, Sparkles, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAiExchange } from '../composables/useAiExchange';
import { useParties } from '../composables/useParties';
import { getPartyHistory } from '../storage/database';
import AiHandoff from './AiHandoff.vue';

/**
 * Ends an adventure at the table: the note on what happened for the party's chronicle, drafted
 * from the session log and written without leaving live mode, or handed to the AI assistant.
 */
const props = defineProps<{ adventure: Adventure; session: Session; party: Party }>();
const { t } = useI18n();
const { save } = useParties();

const dialog = ref<HTMLDialogElement>();
const text = ref('');
const busy = ref(false);
const failed = ref(false);
const saved = ref(false);
const { prompt, copied, copyPrompt } = useAiExchange();

const note = computed(
  () => props.party.chronicle.find((e) => e.adventureId === props.adventure.id)?.whatHappened ?? '',
);

// A note the AI assistant saved while the dialog is open replaces the text in it.
watch(note, (value) => {
  if (dialog.value?.open && value.trim() !== '') text.value = value;
});

/** What the party played of this adventure, as far as it is saved. */
async function history() {
  const loaded = await getPartyHistory(props.party.id).catch(() => undefined);
  return loaded?.adventures.find((a) => a.adventureId === props.adventure.id);
}

/** A draft from the logs of every session the party played of this adventure. */
async function draft(): Promise<string> {
  return draftWhatHappened(props.adventure, await history(), props.session, t('finish.ending'));
}

async function open() {
  failed.value = false;
  saved.value = false;
  copied.value = false;
  prompt.value = '';
  text.value = note.value.trim() !== '' ? note.value : await draft();
  dialog.value?.showModal();
}

async function redraft() {
  if (text.value.trim() !== '' && !window.confirm(t('finish.redraftConfirm'))) return;
  text.value = await draft();
}

/** Copies instructions for the AI; shows them for manual copying if the clipboard is blocked. */
async function suggest() {
  const entry = await history();
  if (entry) await copyPrompt(buildWhatHappenedPrompt(entry));
}

async function finish() {
  busy.value = true;
  failed.value = false;
  try {
    const entry = { adventureId: props.adventure.id, title: props.adventure.title, exists: true };
    await save(setWhatHappened(props.party, entry, text.value));
    saved.value = true;
    dialog.value?.close();
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="finish stack">
    <div class="row">
      <button @click="open">
        <History aria-hidden="true" />{{ t('finish.button') }}
      </button>
      <span v-if="saved" class="hint status" role="status">
        <Check aria-hidden="true" />{{ t('finish.saved', { name: party.name }) }}
      </span>
      <span v-else-if="note.trim() !== ''" class="hint">
        {{ t('finish.written', { name: party.name }) }}
      </span>
    </div>

    <dialog ref="dialog" class="modal" :aria-label="t('finish.heading')">
      <header class="modal-header">
        <h2>{{ t('finish.heading') }}</h2>
        <button
          class="ghost icon-only"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="dialog?.close()"
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <form class="stack" @submit.prevent="finish">
        <p class="hint">{{ t('finish.intro', { name: party.name }) }}</p>
        <label class="field">
          <span>{{ t('chronicle.whatHappened') }}</span>
          <textarea
            v-model="text"
            rows="10"
            maxlength="4000"
            :placeholder="t('chronicle.whatHappenedPlaceholder')"
          />
        </label>
        <AiHandoff
          :task="{ task: 'finish_adventure', adventure: adventure.id, party: party.id }"
          :request="t('ai.tasks.finishAdventure', { title: adventure.title, party: party.name })"
        >
          <div class="row">
            <button type="button" @click="suggest">
              <Sparkles aria-hidden="true" />{{ t('chronicle.suggest') }}
            </button>
          </div>
          <p v-if="copied" class="hint" role="status">{{ t('finish.copied') }}</p>
          <label v-else-if="prompt" class="field">
            <span>{{ t('claude.copyManually') }}</span>
            <textarea
              :value="prompt"
              rows="5"
              readonly
              @focus="($event.target as HTMLTextAreaElement).select()"
            />
          </label>
        </AiHandoff>
        <p v-if="failed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
        <div class="row spread">
          <button type="button" class="ghost" @click="redraft">
            <RotateCcw aria-hidden="true" />{{ t('finish.redraft') }}
          </button>
          <button type="submit" class="primary" :disabled="busy">
            <Check aria-hidden="true" />{{ t('finish.save') }}
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.status svg {
  width: 1rem;
  height: 1rem;
  color: var(--ok);
}
</style>
