<script setup lang="ts">
import {
  CONDITIONS,
  formatChallengeRating,
  type Item,
  monsterStatBlock,
  type Npc,
  npcMonster,
  type ResolvedMonster,
  RULE_ALIASES,
  type Rule,
  resolvePoolMonster,
  type Scene,
  srdMonsters,
  srdRules,
  stripLinks,
} from '@lorewarden/core';
import {
  BookOpen,
  ChevronLeft,
  CornerDownLeft,
  Gem,
  Map as MapIcon,
  Plus,
  Search,
  Skull,
  Swords,
  Users,
  X,
} from '@lucide/vue';
import { type Component, computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useQuickSearch } from '../composables/useQuickSearch';
import { useSettings } from '../composables/useSettings';
import { createSearch, type SearchEntry, type SearchGroup } from '../lib/quick-search';
import ItemCard from './ItemCard.vue';
import MonsterDetails from './MonsterDetails.vue';
import NotesText from './NotesText.vue';
import NpcCard from './NpcCard.vue';

type Target =
  | { kind: 'scene'; scene: Scene }
  | { kind: 'npc'; npc: Npc }
  | { kind: 'item'; item: Item }
  /** ref is the id of the pool monster or of the stat block, for the initiative. */
  | { kind: 'monster'; monster: ResolvedMonster; ref: string }
  | { kind: 'rule'; rule: Rule };
type Entry = SearchEntry<Target>;

const { t } = useI18n();
const { term } = useSettings();
const { page, open } = useQuickSearch();
const { monsters: library } = useMonsterLibrary();

const adventure = computed(() => page.value?.adventure.value);

const groupIcons: Record<SearchGroup, Component> = {
  scenes: MapIcon,
  npcs: Users,
  items: Gem,
  monsters: Skull,
  rules: BookOpen,
};
const groupLabels = computed<Record<SearchGroup, string>>(() => ({
  scenes: t('editor.tabs.scenes'),
  npcs: t('editor.tabs.npcs'),
  items: t('editor.tabs.items'),
  monsters: t('monsters.heading'),
  rules: t('search.rules'),
}));

const crLabel = (cr: number) => `${term('statBlock.cr')} ${formatChallengeRating(cr)}`;
const textOf = (...parts: (string | undefined)[]) => stripLinks(parts.filter(Boolean).join('\n'));

/** The SRD monsters and rules, built once per language. */
const srdEntries = computed<Entry[]>(() => [
  ...srdMonsters.map(
    (statBlock): Entry => ({
      key: `srd:${statBlock.id}`,
      group: 'monsters',
      name: statBlock.name,
      detail: `${crLabel(statBlock.cr)} · ${t('search.srd')}`,
      target: {
        kind: 'monster',
        monster: {
          name: statBlock.name,
          cr: statBlock.cr,
          hp: statBlock.hp,
          ac: statBlock.ac,
          statBlock,
        },
        ref: statBlock.id,
      },
    }),
  ),
  ...srdRules.map((rule): Entry => {
    const condition = rule.name.toLowerCase();
    const translated = (CONDITIONS as readonly string[]).includes(condition)
      ? [t(`conditions.${condition}`)]
      : [];
    return {
      key: `rule:${rule.id}`,
      group: 'rules',
      name: rule.name,
      detail: rule.tag,
      aliases: [...(RULE_ALIASES[rule.name] ?? []), ...translated],
      target: { kind: 'rule', rule },
    };
  }),
]);

/** What the open adventure and the monster library add. */
const ownEntries = computed<Entry[]>(() => {
  const a = adventure.value;
  const entries: Entry[] = [];
  if (a) {
    for (const scene of a.scenes) {
      entries.push({
        key: `scene:${scene.id}`,
        group: 'scenes',
        name: scene.title,
        text: textOf(scene.purpose, ...scene.features, scene.description, scene.notes),
        boost: 5,
        target: { kind: 'scene', scene },
      });
    }
    for (const npc of a.npcs) {
      entries.push({
        key: `npc:${npc.id}`,
        group: 'npcs',
        name: npc.name,
        detail: npc.role,
        text: textOf(npc.role, npc.description, npc.notes, ...npc.tags),
        boost: 5,
        target: { kind: 'npc', npc },
      });
    }
    for (const item of a.items) {
      entries.push({
        key: `item:${item.id}`,
        group: 'items',
        name: item.name,
        detail: item.rarity,
        text: textOf(item.description, item.notes),
        boost: 5,
        target: { kind: 'item', item },
      });
    }
    for (const pool of a.monsterPool) {
      const monster = resolvePoolMonster(a, pool);
      const kind = monster.statBlock?.name;
      entries.push({
        key: `pool:${pool.id}`,
        group: 'monsters',
        name: monster.name,
        detail: [crLabel(monster.cr), kind !== monster.name ? kind : t('search.thisAdventure')]
          .filter(Boolean)
          .join(' · '),
        aliases: kind && kind !== monster.name ? [kind] : [],
        boost: 3,
        target: { kind: 'monster', monster, ref: pool.id },
      });
    }
  }
  // The adventure's own monsters stand in its pool already, unless no pool monster uses them.
  const inPool = new Set(a?.monsterPool.map((pool) => pool.baseMonsterRef));
  const own = [
    ...(a?.monsters ?? []).filter((m) => !inPool.has(m.id)),
    ...library.value.filter((m) => !a?.monsters.some((own) => own.id === m.id)),
  ];
  for (const base of own) {
    const statBlock = monsterStatBlock(base);
    entries.push({
      key: `monster:${base.id}`,
      group: 'monsters',
      name: base.name,
      detail: `${crLabel(base.cr)} · ${t('search.yourMonster')}`,
      boost: 2,
      target: {
        kind: 'monster',
        monster: { name: base.name, cr: base.cr, hp: base.hp, ac: base.ac, statBlock, base },
        ref: base.id,
      },
    });
  }
  return entries;
});

const index = computed(() => createSearch([...ownEntries.value, ...srdEntries.value]));

const query = ref('');
const results = computed(() => index.value.search(query.value));
const flat = computed(() => results.value.flatMap((group) => group.entries));
const active = ref(0);
watch(results, () => {
  active.value = 0;
});

/** A result opened in the search itself, e.g. a stat block or a rule. */
const detail = ref<Entry>();

const dialog = ref<HTMLDialogElement>();
const input = ref<HTMLInputElement>();
const detailPane = ref<HTMLElement>();

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const shortcut = computed(() => (isMac ? '⌘K' : t('search.shortcut')));

watch(open, async (value) => {
  if (value) {
    detail.value = undefined;
    if (!dialog.value?.open) dialog.value?.showModal();
    await nextTick();
    input.value?.select();
  } else if (dialog.value?.open) {
    dialog.value.close();
  }
});

function close() {
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  ) {
    event.preventDefault();
    open.value = !open.value;
  }
}
window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/** Escape goes back from a card to the results, and closes the search from there. */
function onEscape(event: KeyboardEvent) {
  event.preventDefault();
  if (detail.value) back();
  else close();
}

async function back() {
  detail.value = undefined;
  await nextTick();
  input.value?.focus();
}

async function move(step: number) {
  const count = flat.value.length;
  if (count === 0) return;
  active.value = (active.value + step + count) % count;
  await nextTick();
  document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' });
}

function onInputKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') void move(1);
  else if (event.key === 'ArrowUp') void move(-1);
  else if (event.key === 'Enter') {
    const entry = flat.value[active.value];
    if (entry) void choose(entry);
  } else return;
  event.preventDefault();
}

const optionId = (i: number) => `quick-search-option-${i}`;
const indexOf = (entry: Entry) => flat.value.indexOf(entry);

/** Opens a result: the page shows it where it can, otherwise its card opens here. */
async function choose(entry: Entry) {
  const target = entry.target;
  const offer = page.value;
  const action =
    target.kind === 'scene'
      ? offer?.openScene && (() => offer.openScene?.(target.scene.id))
      : target.kind === 'npc'
        ? offer?.openNpc && (() => offer.openNpc?.(target.npc.id))
        : target.kind === 'item'
          ? offer?.openItem && (() => offer.openItem?.(target.item.id))
          : undefined;
  if (action) {
    close();
    action();
    return;
  }
  detail.value = entry;
  await nextTick();
  // The first action, e.g. "Add to initiative", is a second Enter away. The card shows from its top.
  const button = detailPane.value?.querySelector<HTMLButtonElement>('.detail-actions button');
  (button ?? detailPane.value)?.focus({ preventScroll: true });
  dialog.value?.scrollTo({ top: 0 });
}

/** Live mode can put NPCs and monsters into the initiative straight from the results. */
function canAdd(target: Target): boolean {
  if (target.kind === 'npc') return !!page.value?.addNpcToInitiative;
  if (target.kind === 'monster') return !!page.value?.addMonsterToInitiative;
  return false;
}

function addToInitiative(target: Target) {
  if (target.kind === 'npc') page.value?.addNpcToInitiative?.(target.npc.id);
  else if (target.kind === 'monster') {
    page.value?.addMonsterToInitiative?.(target.monster, target.ref);
  }
  close();
}

const detailNpcMonster = computed(() => {
  const target = detail.value?.target;
  return target?.kind === 'npc' && adventure.value
    ? npcMonster(adventure.value, target.npc)
    : undefined;
});
</script>

<template>
  <button
    class="ghost search-trigger"
    :title="`${t('search.open')} (${shortcut})`"
    :aria-label="t('search.open')"
    aria-keyshortcuts="Control+K Meta+K"
    @click="open = true"
  >
    <Search aria-hidden="true" />
    <span class="label">{{ t('search.open') }}</span>
    <kbd class="label">{{ shortcut }}</kbd>
  </button>
  <dialog
    ref="dialog"
    class="modal quick-search"
    :aria-label="t('search.label')"
    @close="close"
    @keydown.esc="onEscape"
  >
    <div v-show="!detail" class="stack">
      <div class="search-field">
        <Search aria-hidden="true" />
        <input
          ref="input"
          v-model="query"
          type="text"
          enterkeyhint="go"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="quick-search-results"
          :aria-expanded="flat.length > 0"
          :aria-activedescendant="flat.length > 0 ? optionId(active) : undefined"
          :aria-label="t('search.label')"
          :placeholder="adventure ? t('search.placeholder') : t('search.placeholderMonsters')"
          autocomplete="off"
          spellcheck="false"
          @keydown="onInputKey"
        />
        <button
          class="ghost icon-only small"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="close"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div id="quick-search-results" class="results" role="listbox" :aria-label="t('search.results')">
        <section v-for="group in results" :key="group.group" role="group" :aria-label="groupLabels[group.group]">
          <h3 class="section-title">
            <component :is="groupIcons[group.group]" aria-hidden="true" />{{ groupLabels[group.group] }}
          </h3>
          <ul class="list" role="presentation">
            <li
              v-for="entry in group.entries"
              :id="optionId(indexOf(entry))"
              :key="entry.key"
              role="option"
              class="result"
              :aria-selected="indexOf(entry) === active"
              @mousemove="active = indexOf(entry)"
              @click="choose(entry)"
            >
              <span class="result-name">{{ entry.name }}</span>
              <span v-if="entry.detail" class="hint result-detail">{{ entry.detail }}</span>
              <button
                v-if="canAdd(entry.target) && indexOf(entry) === active"
                class="small add"
                tabindex="-1"
                :title="t('live.addToInitiative')"
                @click.stop="addToInitiative(entry.target)"
              >
                <Plus aria-hidden="true" /><Swords aria-hidden="true" />
                <span class="sr-only">{{ t('live.addToInitiative') }}</span>
              </button>
              <CornerDownLeft
                v-if="indexOf(entry) === active"
                class="enter-hint"
                aria-hidden="true"
              />
            </li>
          </ul>
        </section>
      </div>
      <p v-if="query.trim() === ''" class="hint">
        {{ adventure ? t('search.emptyAdventure') : t('search.empty') }}
      </p>
      <p v-else-if="flat.length === 0" class="hint">{{ t('search.nothing', { query }) }}</p>
      <p class="hint keys">{{ t('search.keys') }}</p>
    </div>

    <div v-if="detail" ref="detailPane" class="stack detail" tabindex="-1">
      <div class="modal-header">
        <button class="ghost small" @click="back">
          <ChevronLeft aria-hidden="true" />{{ t('search.back') }}
        </button>
        <button
          class="ghost icon-only small"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="close"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <template v-if="detail.target.kind === 'scene'">
        <h2>{{ detail.target.scene.title }}</h2>
        <p v-if="detail.target.scene.purpose" class="muted">
          {{ stripLinks(detail.target.scene.purpose) }}
        </p>
        <blockquote v-if="detail.target.scene.description" class="read-aloud">
          {{ stripLinks(detail.target.scene.description) }}
        </blockquote>
        <NotesText
          v-if="detail.target.scene.notes"
          class="secret"
          :text="detail.target.scene.notes"
        />
      </template>
      <NpcCard
        v-else-if="detail.target.kind === 'npc'"
        :npc="detail.target.npc"
        :monster="detailNpcMonster"
      />
      <ItemCard v-else-if="detail.target.kind === 'item'" :item="detail.target.item" />
      <template v-else-if="detail.target.kind === 'monster'">
        <!-- The stat block has its own heading, unless the monster has a name of its own. -->
        <h2 v-if="detail.target.monster.statBlock?.name !== detail.target.monster.name">
          {{ detail.target.monster.name }}
        </h2>
        <MonsterDetails :monster="detail.target.monster" />
      </template>
      <template v-else>
        <h2>
          {{ detail.target.rule.name }}
          <span v-if="detail.target.rule.tag" class="muted tag-name">
            [{{ detail.target.rule.tag }}]
          </span>
        </h2>
        <p class="rule-text">{{ detail.target.rule.text }}</p>
        <p class="hint">{{ t('terms.source') }}</p>
      </template>
      <div v-if="canAdd(detail.target)" class="row detail-actions">
        <button class="primary" @click="addToInitiative(detail.target)">
          <Swords aria-hidden="true" />{{ t('live.addToInitiative') }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.search-trigger {
  gap: 0.5rem;
  min-width: 0;
  padding: 0.35rem 0.5rem 0.35rem 0.65rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.9rem;
}

.search-trigger kbd {
  padding: 0 0.35rem;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.75rem;
}

@media (max-width: 560px) {
  .search-trigger {
    padding: 0.4rem;
    border-color: transparent;
    background: none;
  }

  .search-trigger .label {
    display: none;
  }
}

dialog.quick-search {
  width: min(42rem, calc(100vw - 1rem));
  max-height: min(40rem, calc(100dvh - 2rem));
  margin-top: max(1rem, 10vh);
  padding: 0.75rem 1rem 1rem;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}

.search-field > svg {
  flex: none;
  color: var(--muted);
}

.search-field input {
  flex: 1;
  border: none;
  padding: 0.35rem 0;
  font-size: 1.05rem;
  background: none;
}

.search-field input:focus {
  box-shadow: none;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.results:empty {
  display: none;
}

.results .section-title {
  margin-bottom: 0.25rem;
}

.result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.result[aria-selected="true"] {
  background: var(--accent-soft);
}

.result-name {
  font-weight: 500;
}

.result-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result .add {
  margin-left: auto;
  gap: 0.1rem;
}

.result .add svg:first-child {
  width: 0.8em;
}

.enter-hint {
  flex: none;
  width: 1rem;
  height: 1rem;
  color: var(--muted);
}

.keys {
  font-size: 0.8rem;
}

@media (hover: none) {
  .keys,
  .enter-hint {
    display: none;
  }
}

.detail:focus {
  outline: none;
}

.detail h2 {
  margin: 0;
}

.detail .modal-header {
  position: sticky;
  top: -0.75rem;
  z-index: 1;
  margin: -0.75rem 0 0;
  padding: 0.5rem 0;
  background: var(--surface);
}

.detail .tag-name {
  font-size: 0.9rem;
  font-weight: 400;
}

.rule-text {
  margin: 0;
  white-space: pre-line;
}
</style>
