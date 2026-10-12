<script setup lang="ts">
import type { Adventure, Party, Reveal, Session } from '@lorewarden/core';
import { Backpack, Pencil, QrCode as QrIcon, Send, Smartphone, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { renewJoinCode } from '../composables/useSettings';
import type { Table } from '../composables/useTable';
import { openedRemotely } from '../lib/server';
import QrCode from './QrCode.vue';

/** party: the adventure's party, whose characters are listed whether their phones are there. */
const props = defineProps<{
  table: Table;
  adventure: Adventure;
  session: Session;
  party?: Party | undefined;
}>();
const { t, d } = useI18n();

// Destructured so the template can use the refs directly.
const { enabled, status, joinUrls, joinCode, onlineIds, recipients } = props.table;

/** The QR code and join code, in a dialog so they do not push the rest of the page down. */
const inviteDialog = ref<HTMLDialogElement>();
const openInvite = () => inviteDialog.value?.showModal();

/** Inviting the players also turns on the phone tools in live mode. */
function invite() {
  props.table.setEnabled(true);
  openInvite();
}

interface Row {
  key: string;
  name: string;
  online: boolean;
  /** The phone of the row: a connected one, else the last one that played the character. */
  playerId?: string;
  character: boolean;
}

/**
 * Everyone at the table: first the party's characters, connected or not, then the phones of
 * players who play none of them. Phones from earlier sessions that played a character are
 * folded into its row.
 */
const rows = computed<Row[]>(() => {
  const players = props.session.players;
  const online = onlineIds.value;
  const folded = new Set<string>();
  const characters = (props.party?.characters ?? []).map((character) => {
    const name = character.name.trim().toLocaleLowerCase();
    const phones = players.filter(
      (p) =>
        p.characterId === character.id ||
        (!p.characterId && p.name.trim().toLocaleLowerCase() === name),
    );
    for (const phone of phones) folded.add(phone.id);
    const phone = phones.find((p) => online.has(p.id)) ?? phones.at(-1);
    return {
      key: character.id,
      name: character.name,
      online: phone !== undefined && online.has(phone.id),
      ...(phone ? { playerId: phone.id } : {}),
      character: true,
    };
  });
  const others = players
    .filter((p) => !folded.has(p.id))
    .map((p) => ({
      key: p.id,
      name: p.name,
      online: online.has(p.id),
      playerId: p.id,
      character: false,
    }));
  return [...characters, ...others];
});

const onlineCount = computed(() => rows.value.filter((row) => row.online).length);
/** Who is expected at the table: the party's characters and the phones there now. */
const expected = computed(() => rows.value.filter((row) => row.character || row.online).length);
/** With a party, its characters are shown above with their numbers; here only the other phones. */
const listed = computed(() =>
  props.party ? rows.value.filter((row) => !row.character) : rows.value,
);
/** Rows with a phone, which reveals can be sent to. */
const reachable = computed(() =>
  rows.value.flatMap((row) => (row.playerId ? [{ ...row, playerId: row.playerId }] : [])),
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
  <section class="stack players-tab" :aria-label="t('table.heading')">
    <header class="tab-head">
      <h3 class="section-title">
        <template v-if="party"><Backpack aria-hidden="true" />{{ party.name }}</template>
        <template v-else><Smartphone aria-hidden="true" />{{ t('table.heading') }}</template>
        <span
          v-if="enabled && expected > 0"
          class="count"
          :title="t('table.connectedCount', { online: onlineCount, total: expected })"
        >
          <Smartphone aria-hidden="true" />{{ onlineCount }}/{{ expected }}
        </span>
      </h3>
      <div class="row">
        <button class="small" :class="{ primary: onlineCount === 0 }" @click="invite">
          <QrIcon aria-hidden="true" />{{ t('table.invite') }}
        </button>
        <RouterLink
          v-if="party"
          class="ghost-link"
          :to="{ name: 'party', query: { id: party.id } }"
          :title="t('party.edit')"
          :aria-label="t('party.edit')"
        >
          <Pencil aria-hidden="true" />
        </RouterLink>
      </div>
    </header>
    <p v-if="!enabled" class="hint">{{ t('table.intro') }}</p>

    <!-- The party's characters with their numbers. -->
    <slot />

    <div v-if="enabled && listed.length > 0" class="stack">
      <h3 v-if="party" class="section-title">{{ t('table.otherPlayers') }}</h3>
      <ul class="list players" :aria-label="t('table.players')">
        <li v-for="row in listed" :key="row.key" class="player">
          <span
            class="dot"
            :class="{ online: row.online }"
            :title="row.online ? t('table.online') : t('table.offline')"
          />
          {{ row.name }}
          <span class="sr-only">{{ row.online ? t('table.online') : t('table.offline') }}</span>
          <!-- Phones of players outside the party can be removed once they have left. -->
          <button
            v-if="!row.character && !row.online && row.playerId"
            class="ghost small icon-only"
            :aria-label="t('table.forget', { name: row.name })"
            :title="t('table.forget', { name: row.name })"
            @click="row.playerId && forget(row.playerId, row.name)"
          >
            <X aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
    <p v-else-if="enabled && !party && rows.length === 0" class="hint">{{ t('table.noPlayers') }}</p>

    <div v-if="enabled" class="card stack phones">
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
                v-for="row in reachable"
                v-show="!toEveryone"
                :key="row.key"
                class="chip"
              >
                <input
                  type="checkbox"
                  :checked="isRecipient(row.playerId)"
                  @change="toggleRecipient(row.playerId)"
                />
                {{ row.name }}
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
    </div>

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


.tab-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tab-head .section-title {
  margin: 0;
}

.tab-head .count {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.tab-head .count svg {
  width: 0.8rem;
  height: 0.8rem;
}

.ghost-link {
  display: inline-flex;
  padding: 0.3rem;
  border-radius: var(--radius-sm);
  color: var(--muted);
}

.ghost-link:hover {
  color: var(--text);
  background: var(--surface-2);
}

.ghost-link svg {
  width: 1rem;
  height: 1rem;
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
