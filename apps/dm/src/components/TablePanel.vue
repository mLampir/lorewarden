<script setup lang="ts">
import type { Adventure, Reveal, Session } from '@lorewarden/core';
import { QrCode as QrIcon, Send, Smartphone, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { renewJoinCode } from '../composables/useSettings';
import type { Table } from '../composables/useTable';
import { openedRemotely } from '../lib/server';
import QrCode from './QrCode.vue';

const props = defineProps<{ table: Table; adventure: Adventure; session: Session }>();
const { t, d } = useI18n();

// Destructured so the template can use the refs directly.
const { enabled, status, joinUrls, joinCode, onlineIds, recipients } = props.table;

/** The QR code and join code, in a dialog so they do not push the rest of the page down. */
const inviteDialog = ref<HTMLDialogElement>();
const openInvite = () => inviteDialog.value?.showModal();

/** Turning the phones on with nobody at the table yet goes straight to the invitation. */
function toggleTable() {
  const turnOn = !enabled.value;
  props.table.setEnabled(turnOn);
  if (turnOn && props.session.players.length === 0) openInvite();
}

const onlineCount = computed(
  () => props.session.players.filter((p) => onlineIds.value.has(p.id)).length,
);

const urlIndex = ref(0);
watch(joinUrls, () => {
  urlIndex.value = 0;
});
const joinUrl = computed(() => {
  const base = joinUrls.value[urlIndex.value];
  return base ? `${base}?code=${joinCode.value}` : undefined;
});

const playerNames = computed(() => new Map(props.session.players.map((p) => [p.id, p.name])));

function recipientNames(to: Reveal['to']): string {
  if (to === 'all') return t('table.everyone');
  return to.map((id) => playerNames.value.get(id) ?? '?').join(', ');
}

const newestFirst = computed(() =>
  [...props.session.revealed].sort((a, b) => b.at.localeCompare(a.at)),
);

function revealTitle(reveal: Reveal): string {
  if (reveal.kind === 'text') return reveal.title || reveal.text || '';
  if (reveal.kind === 'puzzle' || reveal.kind === 'puzzleHint') {
    const puzzle = props.adventure.puzzles.find((p) => p.id === reveal.puzzleId);
    if (!puzzle || reveal.kind === 'puzzle') return puzzle?.title ?? '?';
    const n = puzzle.hints.findIndex((h) => h.id === reveal.hintId) + 1;
    return t('table.puzzleHint', { title: puzzle.title, n: n || '?' });
  }
  return props.adventure.assets.find((a) => a.id === reveal.assetId)?.title ?? '?';
}

const toEveryone = computed({
  get: () => recipients.value === 'all',
  set: (value: boolean) => {
    recipients.value = value ? 'all' : [];
  },
});

function isRecipient(playerId: string): boolean {
  return Array.isArray(recipients.value) && recipients.value.includes(playerId);
}

function toggleRecipient(playerId: string) {
  const current = Array.isArray(recipients.value) ? recipients.value : [];
  recipients.value = current.includes(playerId)
    ? current.filter((id) => id !== playerId)
    : [...current, playerId];
}

const nobodyChosen = computed(
  () => Array.isArray(recipients.value) && recipients.value.length === 0,
);

const hintTitle = ref('');
const hintText = ref('');

function revealHint() {
  props.table.reveal({ kind: 'text', title: hintTitle.value, text: hintText.value });
  hintTitle.value = '';
  hintText.value = '';
}

const images = computed(() => props.adventure.assets);
const imageId = ref('');

function revealImage() {
  if (!imageId.value) return;
  props.table.reveal({ kind: 'asset', assetId: imageId.value });
  imageId.value = '';
}

function forget(playerId: string, name: string) {
  if (window.confirm(t('table.forgetConfirm', { name }))) props.table.forget(playerId);
}

function newCode() {
  if (window.confirm(t('table.newCodeConfirm'))) renewJoinCode();
}
</script>

<template>
  <section class="card stack" :aria-label="t('table.heading')">
    <header class="row spread">
      <h2 class="inline">
        <Smartphone aria-hidden="true" />{{ t('table.heading') }}
        <span v-if="enabled && session.players.length > 0" class="count">
          {{ onlineCount }}/{{ session.players.length }}
        </span>
      </h2>
      <div class="row">
        <button v-if="enabled" class="small" @click="openInvite">
          <QrIcon aria-hidden="true" />{{ t('table.invite') }}
        </button>
        <button
          class="small"
          :class="enabled ? 'ghost' : 'primary'"
          :aria-pressed="enabled"
          @click="toggleTable"
        >
          {{ enabled ? t('table.disconnect') : t('table.connect') }}
        </button>
      </div>
    </header>

    <p v-if="!enabled" class="hint">{{ t('table.intro') }}</p>
    <template v-else>
      <p v-if="session.players.length === 0" class="hint">{{ t('table.noPlayers') }}</p>
      <ul v-else class="list players" :aria-label="t('table.players')">
        <li v-for="player in session.players" :key="player.id" class="player">
          <span
            class="dot"
            :class="{ online: onlineIds.has(player.id) }"
            :title="onlineIds.has(player.id) ? t('table.online') : t('table.offline')"
          />
          {{ player.name }}
          <span class="sr-only">
            {{ onlineIds.has(player.id) ? t('table.online') : t('table.offline') }}
          </span>
          <button
            class="ghost small icon-only"
            :aria-label="t('table.forget', { name: player.name })"
            :title="t('table.forget', { name: player.name })"
            @click="forget(player.id, player.name)"
          >
            <X aria-hidden="true" />
          </button>
        </li>
      </ul>

      <details class="reveal-form">
        <summary><Send aria-hidden="true" />{{ t('table.showSomething') }}</summary>
        <div class="stack">
          <div>
            <p class="hint">{{ t('table.revealTo') }}</p>
            <div class="row">
              <label class="chip">
                <input v-model="toEveryone" type="checkbox" />
                {{ t('table.everyone') }}
              </label>
              <label
                v-for="player in session.players"
                v-show="!toEveryone"
                :key="player.id"
                class="chip"
              >
                <input
                  type="checkbox"
                  :checked="isRecipient(player.id)"
                  @change="toggleRecipient(player.id)"
                />
                {{ player.name }}
              </label>
            </div>
            <p v-if="nobodyChosen" class="hint">{{ t('table.chooseRecipients') }}</p>
          </div>

          <form v-if="images.length > 0" class="row" @submit.prevent="revealImage">
            <select v-model="imageId" class="grow" :aria-label="t('table.image')">
              <option value="" disabled>{{ t('table.chooseImage') }}</option>
              <option v-for="image in images" :key="image.id" :value="image.id">
                {{ image.title }}
              </option>
            </select>
            <button class="small" type="submit" :disabled="!imageId || nobodyChosen">
              {{ t('table.reveal') }}
            </button>
          </form>

          <form class="stack" @submit.prevent="revealHint">
            <input v-model="hintTitle" :placeholder="t('table.hintTitle')" maxlength="80" />
            <textarea v-model="hintText" rows="2" :placeholder="t('table.hintText')" />
            <div class="row">
              <button class="small" type="submit" :disabled="!hintText.trim() || nobodyChosen">
                {{ t('table.revealHint') }}
              </button>
            </div>
          </form>
        </div>
      </details>

      <div v-if="newestFirst.length > 0" class="stack">
        <h3>{{ t('table.revealed') }}</h3>
        <ul class="list stack">
          <li v-for="reveal in newestFirst" :key="reveal.id" class="row spread revealed">
            <span>
              {{ revealTitle(reveal) }}
              <small class="muted">
                · {{ recipientNames(reveal.to) }} · {{ d(new Date(reveal.at), 'time') }}
              </small>
            </span>
            <button class="small ghost" @click="table.hide(reveal.id)">{{ t('table.hide') }}</button>
          </li>
        </ul>
      </div>
    </template>

    <dialog ref="inviteDialog" class="modal invite" :aria-label="t('table.join')">
      <header class="modal-header">
        <h2>{{ t('table.join') }}</h2>
        <button
          class="ghost icon-only"
          :aria-label="t('common.close')"
          @click="inviteDialog?.close()"
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <div v-if="status === 'connected'" class="stack join-body">
        <template v-if="joinUrl">
          <QrCode class="qr" :value="joinUrl" :label="t('table.qrLabel')" />
          <p class="hint">{{ openedRemotely ? t('table.joinHintRemote') : t('table.joinHint') }}</p>
          <p class="url">{{ joinUrl }}</p>
          <label v-if="joinUrls.length > 1" class="field">
            <span>{{ t('table.network') }}</span>
            <select v-model="urlIndex">
              <option v-for="(url, i) in joinUrls" :key="url" :value="i">{{ url }}</option>
            </select>
          </label>
        </template>
        <p v-else class="error">{{ t('table.noNetwork') }}</p>
        <div class="row spread">
          <span>
            {{ t('table.code') }} <strong class="code">{{ joinCode }}</strong>
          </span>
          <button class="small" @click="newCode">{{ t('table.newCode') }}</button>
        </div>
      </div>
      <p v-else class="muted">{{ t('common.loading') }}</p>
    </dialog>
  </section>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 1.1rem;
}

h2 svg {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--accent);
}

h3 {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
  color: var(--muted);
}


.players {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.player {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.15rem 0.1rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
}

.reveal-form summary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-weight: 600;
  color: var(--accent);
}

.reveal-form summary svg {
  width: 1rem;
  height: 1rem;
}

.reveal-form > .stack {
  margin-top: 0.75rem;
}

.reveal-form .hint {
  margin-bottom: 0.4rem;
}

.invite {
  width: min(26rem, calc(100vw - 2rem));
}

.qr {
  align-self: center;
}

.url {
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  word-break: break-all;
}

.code {
  font-family: ui-monospace, monospace;
  font-size: 1.2rem;
  letter-spacing: 0.15em;
}

.dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--border-strong);
}

.dot.online {
  background: var(--ok);
}

.revealed small {
  white-space: nowrap;
}

.spread {
  justify-content: space-between;
}

.grow {
  flex: 1 1 10rem;
  min-width: 0;
}
</style>
