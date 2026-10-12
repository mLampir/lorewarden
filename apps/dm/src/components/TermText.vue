<script setup lang="ts">
import { linkTerms, type TermTarget } from '@lorewarden/core';
import { computed, inject, onBeforeUnmount, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { termIndexKey } from '../lib/terms';
import ItemCard from './ItemCard.vue';
import NpcCard from './NpcCard.vue';
import StatBlockView from './StatBlockView.vue';

const props = defineProps<{ text: string }>();

const { t } = useI18n();
const index = inject(termIndexKey, undefined);
// The NPC and item cards in the popup show their text without links, so no popup opens inside it.
provide(termIndexKey, ref(undefined));

const segments = computed(() =>
  index?.value ? linkTerms(props.text, index.value) : [{ text: props.text }],
);

const open = ref<{
  target: TermTarget;
  top: number;
  left: number;
  above: boolean;
  /** Room left on the screen in the direction the popup opens. */
  room: number;
}>();
let hideTimer: ReturnType<typeof setTimeout> | undefined;

const WIDTH = 480;

/** Opens the popup below the word, or above it when the word is in the lower half. */
function show(event: Event, target: TermTarget) {
  clearTimeout(hideTimer);
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const above = rect.top > window.innerHeight / 2;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
  const top = above ? rect.top - 6 : rect.bottom + 6;
  const room = (above ? top : window.innerHeight - top) - 8;
  open.value = { target, left, above, top, room };
}

function keepOpen() {
  clearTimeout(hideTimer);
}

function hideSoon() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    open.value = undefined;
  }, 150);
}

function toggle(event: Event, target: TermTarget) {
  if (open.value?.target === target) open.value = undefined;
  else show(event, target);
}

onBeforeUnmount(() => clearTimeout(hideTimer));
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i">
    <template v-if="!segment.target">{{ segment.text }}</template>
    <button
      v-else
      type="button"
      class="term"
      :aria-expanded="open?.target === segment.target"
      @mouseenter="show($event, segment.target)"
      @mouseleave="hideSoon"
      @focus="show($event, segment.target)"
      @blur="hideSoon"
      @click="toggle($event, segment.target)"
      @keydown.escape="open = undefined"
    >{{ segment.text }}</button>
  </template>
  <Teleport v-if="open" to="body">
    <div
      class="term-popover"
      role="tooltip"
      :class="{ above: open.above }"
      :style="{
        left: `${open.left}px`,
        top: `${open.top}px`,
        width: `min(${WIDTH}px, calc(100vw - 16px))`,
        maxHeight: `${open.room}px`,
      }"
      @mouseenter="keepOpen"
      @mouseleave="hideSoon"
    >
      <template v-if="open.target.kind === 'rule'">
        <p class="rule-name">
          <strong>{{ open.target.rule.name }}</strong>
          <span v-if="open.target.rule.tag" class="muted"> [{{ open.target.rule.tag }}]</span>
        </p>
        <p class="rule-text">{{ open.target.rule.text }}</p>
        <p class="hint">{{ t('terms.source') }}</p>
      </template>
      <NpcCard v-else-if="open.target.kind === 'npc'" :npc="open.target.npc" />
      <ItemCard v-else-if="open.target.kind === 'item'" :item="open.target.item" />
      <StatBlockView
        v-else
        :stat-block="open.target.statBlock"
        :source="open.target.source"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.term {
  all: unset;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 0.2em;
}

.term:focus-visible {
  outline: 2px solid var(--accent, currentColor);
  outline-offset: 1px;
}
</style>

<style>
.term-popover {
  position: fixed;
  z-index: 50;
  overflow: auto;
  padding: 0.6rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
  font-style: normal;
  font-size: 0.9rem;
}

.term-popover.above {
  transform: translateY(-100%);
}

.term-popover p {
  margin: 0 0 0.4rem;
}

.term-popover > .card {
  padding: 0;
  border: 0;
  box-shadow: none;
  background: none;
}

.term-popover > .card .actions:empty {
  display: none;
}

.term-popover .rule-text {
  white-space: pre-line;
}
</style>
