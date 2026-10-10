<script setup lang="ts">
import { type Adventure, layoutSceneGraph } from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  adventure: Adventure;
  selectedId?: string;
  /** Scene the party is in during live mode. */
  currentId?: string;
}>();

const emit = defineEmits<{ select: [sceneId: string] }>();

const { t } = useI18n();

const NODE_W = 172;
const NODE_H = 52;
const GAP_X = 64;
const GAP_Y = 22;
const PAD = 16;
const MAX_CHARS = 22;

const graph = computed(() => layoutSceneGraph(props.adventure));
const titles = computed(() => new Map(props.adventure.scenes.map((s) => [s.id, s.title])));

const positions = computed(
  () =>
    new Map(
      graph.value.nodes.map((node) => [
        node.sceneId,
        { x: PAD + node.column * (NODE_W + GAP_X), y: PAD + node.row * (NODE_H + GAP_Y) },
      ]),
    ),
);

const width = computed(() => PAD * 2 + Math.max(1, graph.value.columns) * (NODE_W + GAP_X) - GAP_X);
const height = computed(() => PAD * 2 + Math.max(1, graph.value.rows) * (NODE_H + GAP_Y) - GAP_Y);

const edges = computed(() =>
  graph.value.edges.flatMap((edge, index) => {
    const from = positions.value.get(edge.from);
    const to = positions.value.get(edge.to);
    if (!from || !to) return [];
    let path: string;
    if (to.x > from.x) {
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x - 4;
      const y2 = to.y + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      path = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
    } else if (to.x === from.x) {
      // Exits within a column run straight up or down between the two nodes.
      const down = to.y > from.y;
      const x = from.x + NODE_W / 2 + (down ? 12 : -12);
      const y1 = down ? from.y + NODE_H : from.y;
      const y2 = down ? to.y - 4 : to.y + NODE_H + 4;
      path = `M ${x} ${y1} L ${x} ${y2}`;
    } else {
      // Exits that lead back curve below the nodes.
      const x1 = from.x + NODE_W / 2 - 12;
      const y1 = from.y + NODE_H;
      const x2 = to.x + NODE_W / 2 + 12;
      const y2 = to.y + NODE_H + 4;
      const dip = Math.max(y1, y2) + GAP_Y + 8;
      path = `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`;
    }
    const label = `${titles.value.get(edge.from)} → ${titles.value.get(edge.to)}: ${edge.label}`;
    return [{ key: `${edge.from}-${edge.to}-${index}`, path, label }];
  }),
);

const nodes = computed(() =>
  graph.value.nodes.map((node) => {
    const title = titles.value.get(node.sceneId) ?? '';
    const short = title.length > MAX_CHARS ? `${title.slice(0, MAX_CHARS - 1)}…` : title;
    return {
      ...node,
      ...(positions.value.get(node.sceneId) ?? { x: 0, y: 0 }),
      title,
      short,
      start: node.sceneId === props.adventure.startSceneId,
      selected: node.sceneId === props.selectedId,
      current: node.sceneId === props.currentId,
    };
  }),
);
</script>

<template>
  <div class="graph" role="group" :aria-label="t('scenes.graph')">
    <svg :width="width" :height="height + GAP_Y" :viewBox="`0 0 ${width} ${height + GAP_Y}`">
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" class="arrowhead" />
        </marker>
      </defs>
      <path v-for="edge in edges" :key="edge.key" :d="edge.path" class="edge" marker-end="url(#arrow)">
        <title>{{ edge.label }}</title>
      </path>
      <g
        v-for="node in nodes"
        :key="node.sceneId"
        class="node"
        :class="{
          start: node.start,
          selected: node.selected,
          current: node.current,
          unreachable: !node.reachable,
        }"
        role="button"
        tabindex="0"
        :aria-pressed="node.selected"
        :aria-label="node.title"
        :transform="`translate(${node.x} ${node.y})`"
        @click="emit('select', node.sceneId)"
        @keydown.enter.prevent="emit('select', node.sceneId)"
        @keydown.space.prevent="emit('select', node.sceneId)"
      >
        <title>{{ node.title }}</title>
        <rect :width="NODE_W" :height="NODE_H" rx="8" />
        <text :x="12" :y="22" class="node-title">{{ node.short }}</text>
        <text :x="12" :y="40" class="node-meta">
          <template v-if="node.current">{{ t('scenes.here') }}</template>
          <template v-else-if="node.start">{{ t('scenes.start') }}</template>
          <template v-else-if="!node.reachable">{{ t('scenes.unreachable') }}</template>
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.graph {
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-height: 22rem;
}

svg {
  display: block;
}

.edge {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.5;
}

.arrowhead {
  fill: var(--muted);
}

.node {
  cursor: pointer;
}

.node rect {
  fill: var(--surface-2);
  stroke: var(--border);
  stroke-width: 1.5;
}

.node:hover rect,
.node:focus-visible rect {
  stroke: var(--accent);
}

.node:focus {
  outline: none;
}

.node.start rect {
  stroke: var(--accent);
  stroke-width: 2.5;
}

.node.unreachable rect {
  stroke-dasharray: 5 4;
}

.node.selected rect {
  fill: var(--accent);
}

.node.selected text {
  fill: var(--accent-text);
}

.node.current rect {
  stroke: var(--ok);
  stroke-width: 3;
}

.node-title {
  fill: var(--text);
  font-size: 14px;
  font-weight: 600;
}

.node-meta {
  fill: var(--muted);
  font-size: 12px;
}
</style>
