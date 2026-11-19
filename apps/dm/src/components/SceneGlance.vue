<script setup lang="ts">
import type { Npc, Scene } from '@lorewarden/core';
import { Signpost, Target, Users } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TermText from './TermText.vue';

/**
 * The scene at a glance in live mode: purpose, features, who is here and the way out, shown first
 * so the scene is recalled in seconds. Shows nothing when the scene has none of them.
 */
const props = defineProps<{ scene: Scene; npcs: Npc[] }>();
const emit = defineEmits<{ showNpc: [npcId: string] }>();
const { t } = useI18n();

const features = computed(() => props.scene.features.filter((f) => f.trim() !== ''));
const hasGlance = computed(
  () =>
    !!props.scene.purpose ||
    !!props.scene.wayOut ||
    features.value.length > 0 ||
    props.npcs.length > 0,
);
</script>

<template>
  <div v-if="hasGlance" class="glance">
    <p v-if="scene.purpose" class="glance-line">
      <Target aria-hidden="true" />
      <span>
        <span class="glance-label">{{ t('live.purpose') }}</span>
        <TermText :text="scene.purpose" />
      </span>
    </p>
    <ul v-if="features.length > 0" class="glance-features" :aria-label="t('live.features')">
      <li v-for="(feature, i) in features" :key="i" class="pill">
        <TermText :text="feature" />
      </li>
    </ul>
    <p v-if="npcs.length > 0" class="glance-line">
      <Users aria-hidden="true" />
      <span class="here">
        <span class="glance-label">{{ t('live.here') }}</span>
        <button
          v-for="npc in npcs"
          :key="npc.id"
          class="small"
          :aria-label="t('live.showNpc', { name: npc.name })"
          @click="emit('showNpc', npc.id)"
        >
          {{ npc.name }}
        </button>
      </span>
    </p>
    <p v-if="scene.wayOut" class="glance-line">
      <Signpost aria-hidden="true" />
      <span>
        <span class="glance-label">{{ t('live.wayOut') }}</span>
        <TermText :text="scene.wayOut" />
      </span>
    </p>
  </div>
</template>

<style scoped>
.glance {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.glance-line {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
}

.glance-line svg {
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  color: var(--accent);
}

.glance-line:first-child {
  font-size: 1.05rem;
  font-weight: 600;
}

.glance-label {
  margin-right: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.glance-features {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  background: var(--surface-2);
  font-weight: 500;
}

.here {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
</style>
