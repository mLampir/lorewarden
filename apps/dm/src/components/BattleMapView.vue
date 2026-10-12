<script setup lang="ts">
import { type BattleMap, BattleMapFeatureKind } from '@lorewarden/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import NotesText from './NotesText.vue';

/** "compact" leaves out the legend and notes, e.g. for a preview next to the notes field. */
const props = defineProps<{ map: BattleMap; compact?: boolean }>();

const { t } = useI18n();

/** Size of one 5-foot square in SVG units, plus room for the row and column numbers. */
const CELL = 40;
const MARGIN = 24;

const order = BattleMapFeatureKind.options;

// Areas first, then objects, then start zones, so nothing important is hidden.
const features = computed(() =>
  [...props.map.features].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
);
const kinds = computed(() =>
  order.filter((kind) => props.map.features.some((f) => f.kind === kind)),
);
/**
 * Places each label inside or next to its feature where it does not cover another label. Start
 * zones go first, large areas last, so the small things keep their spot.
 */
const labels = computed(() => {
  const placed: { x: number; y: number; w: number }[] = [];
  const maxX = props.map.width * CELL;
  const maxY = props.map.height * CELL;
  const overlaps = (x: number, y: number, w: number) =>
    placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 2 && Math.abs(p.y - y) < 15);
  return [...features.value].reverse().flatMap((f) => {
    if (!f.label) return [];
    const w = f.label.length * 7.5 + 6;
    const cx = (f.x + f.w / 2) * CELL;
    const top = f.y * CELL;
    const bottom = (f.y + f.h) * CELL;
    const candidates = [(top + bottom) / 2 + 4, top + 14, bottom - 5, bottom + 14, top - 4].map(
      (y) => ({ x: Math.min(Math.max(cx, w / 2), maxX - w / 2), y }),
    );
    const free = candidates.find((c) => c.y > 10 && c.y < maxY + 16 && !overlaps(c.x, c.y, w));
    const spot = free ?? (candidates[0] as { x: number; y: number });
    placed.push({ ...spot, w });
    return [{ ...spot, text: f.label }];
  });
});

const viewBox = computed(
  // Room below the grid for a label that does not fit on the map.
  () => `0 0 ${MARGIN + props.map.width * CELL + 2} ${MARGIN + props.map.height * CELL + 20}`,
);
</script>

<template>
  <figure class="battle-map">
    <svg :viewBox="viewBox" class="grid-svg" role="img" :aria-label="t('battleMap.title')">
      <defs>
        <pattern id="bm-hatch" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 10 L10 0" class="hatch" />
        </pattern>
        <pattern id="bm-steps" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 5 H10" class="hatch" />
        </pattern>
      </defs>
      <g class="axis">
        <text v-for="x in map.width" :key="`c${x}`" :x="MARGIN + (x - 0.5) * CELL" :y="MARGIN - 8">
          {{ x }}
        </text>
        <text v-for="y in map.height" :key="`r${y}`" :x="MARGIN - 6" :y="MARGIN + (y - 0.5) * CELL + 4" class="row-number">
          {{ y }}
        </text>
      </g>
      <g :transform="`translate(${MARGIN + 1} ${MARGIN + 1})`">
        <rect :width="map.width * CELL" :height="map.height * CELL" class="ground" />
        <rect
          v-for="(f, i) in features"
          :key="i"
          :x="f.x * CELL"
          :y="f.y * CELL"
          :width="f.w * CELL"
          :height="f.h * CELL"
          :class="['feature', f.kind]"
        />
        <g class="grid">
          <line v-for="x in map.width - 1" :key="`v${x}`" :x1="x * CELL" :x2="x * CELL" y1="0" :y2="map.height * CELL" />
          <line v-for="y in map.height - 1" :key="`h${y}`" :y1="y * CELL" :y2="y * CELL" x1="0" :x2="map.width * CELL" />
        </g>
        <rect :width="map.width * CELL" :height="map.height * CELL" class="border" />
        <text v-for="(l, i) in labels" :key="`l${i}`" :x="l.x" :y="l.y" class="label">
          {{ l.text }}
        </text>
      </g>
    </svg>
    <figcaption v-if="!compact" class="stack">
      <div v-if="kinds.length > 0" class="row legend">
        <span v-for="kind in kinds" :key="kind" class="inline">
          <svg viewBox="0 0 16 16" class="swatch" aria-hidden="true">
            <rect width="16" height="16" class="ground" />
            <rect width="16" height="16" :class="['feature', kind]" />
          </svg>
          {{ t(`battleMap.kinds.${kind}`) }}
        </span>
      </div>
      <p class="hint">{{ t('battleMap.scale') }}</p>
      <NotesText v-if="map.notes" class="secret" :text="map.notes" />
    </figcaption>
  </figure>
</template>

<style scoped>
.battle-map {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
}

.grid-svg {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

figcaption {
  flex: none;
}

.axis text {
  font-size: 13px;
  fill: var(--muted);
  text-anchor: middle;
}

.axis .row-number {
  text-anchor: end;
}

.ground {
  fill: var(--surface);
}

.grid line {
  stroke: var(--border);
  stroke-width: 1;
}

.border {
  fill: none;
  stroke: var(--muted);
  stroke-width: 2;
}

.hatch {
  stroke: #8a6a35;
  stroke-width: 2;
}

.feature.water {
  fill: #3d8ac4;
  fill-opacity: 0.4;
}

.feature.difficult {
  fill: url(#bm-hatch);
}

.feature.hazard {
  fill: #d0452f;
  fill-opacity: 0.55;
}

.feature.wall {
  fill: var(--text);
}

.feature.door {
  fill: #a0682e;
  stroke: var(--text);
  stroke-width: 3;
}

.feature.obstacle {
  fill: #5a5a5a;
  fill-opacity: 0.85;
}

.feature.cover {
  fill: #5f8c34;
  fill-opacity: 0.6;
}

.feature.stairs {
  fill: url(#bm-steps);
  stroke: #8a6a35;
  stroke-width: 2;
}

.feature.party,
.feature.enemy {
  fill-opacity: 0.2;
  stroke-width: 3;
  stroke-dasharray: 6 4;
}

.feature.party {
  fill: #2f6bd1;
  stroke: #2f6bd1;
}

.feature.enemy {
  fill: #c62828;
  stroke: #c62828;
}

.label {
  font-size: 13px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text);
  stroke: var(--surface);
  stroke-width: 4px;
  paint-order: stroke;
}

.swatch {
  width: 1rem;
  height: 1rem;
  border: 1px solid var(--border);
}

.legend {
  gap: 0.4rem 1rem;
  font-size: 0.9rem;
}

.battle-map p {
  margin: 0;
  white-space: pre-line;
}
</style>
