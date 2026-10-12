<script setup lang="ts">
import { type Adventure, type Clue, type ClueLead, clueSceneIds } from '@lorewarden/core';
import { Footprints, MapPin } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';

const props = defineProps<{ adventure: Adventure; clue: Clue }>();
const emit = defineEmits<{ remove: [] }>();

const { t } = useI18n();

function toggle(list: string[], id: string) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}

/** Scenes the clue's leads add on top of the ones ticked here. */
const leadScenes = computed(() => {
  const ticked = new Set(props.clue.sceneIds);
  const ids = new Set(clueSceneIds(props.adventure, props.clue).filter((id) => !ticked.has(id)));
  return props.adventure.scenes.filter((scene) => ids.has(scene.id));
});

/** Where a lead turns up, as one select value: "scene:<id>", "npc:<id>" or "" for anywhere. */
function whereOf(lead: ClueLead): string {
  if (lead.npcId) return `npc:${lead.npcId}`;
  if (lead.sceneId) return `scene:${lead.sceneId}`;
  return '';
}

function setWhere(lead: ClueLead, value: string) {
  const [kind, id] = value.split(':');
  lead.sceneId = kind === 'scene' ? id : undefined;
  lead.npcId = kind === 'npc' ? id : undefined;
}

const newLead = ref('');

function addLead() {
  const text = newLead.value.trim();
  if (!text) return;
  props.clue.leads.push({ text });
  newLead.value = '';
}

/** A lead emptied by the game master is removed. */
function tidyLead(index: number) {
  if (props.clue.leads[index]?.text.trim() === '') props.clue.leads.splice(index, 1);
}

const BULLET = /^\s*[-*•]\s+/;

/** Bullet points in the notes of clues written before leads existed. */
const noteBullets = computed(() =>
  props.clue.notes.split(/\r?\n/).filter((line) => BULLET.test(line)),
);

/** Turns each bullet point of the notes into a lead; the rest of the notes stays. */
function leadsFromNotes() {
  for (const line of noteBullets.value) {
    props.clue.leads.push({ text: line.replace(BULLET, '').replaceAll('**', '').trim() });
  }
  props.clue.notes = props.clue.notes
    .split(/\r?\n/)
    .filter((line) => !BULLET.test(line))
    .join('\n')
    .trim();
}
</script>

<template>
  <div class="card stack">
    <label class="field">
      <span>{{ t('clues.text') }}</span>
      <textarea
        v-model="clue.text"
        rows="2"
        required
        :placeholder="t('clues.textHint')"
        @blur="fillIfBlank(clue, 'text', t('common.untitled'))"
      />
    </label>

    <fieldset class="stack">
      <legend><Footprints aria-hidden="true" />{{ t('clues.leads') }}</legend>
      <p class="hint">{{ t('clues.leadsHint') }}</p>
      <ul v-if="clue.leads.length > 0" class="stack leads">
        <li v-for="(lead, i) in clue.leads" :key="i" class="row">
          <textarea
            v-model="lead.text"
            rows="1"
            class="grow"
            :aria-label="t('clues.leadNumber', { n: i + 1 })"
            @blur="tidyLead(i)"
          />
          <select
            class="where"
            :value="whereOf(lead)"
            :aria-label="t('clues.leadWhere', { n: i + 1 })"
            @change="setWhere(lead, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('clues.anywhere') }}</option>
            <optgroup v-if="adventure.scenes.length > 0" :label="t('clues.inScene')">
              <option v-for="scene in adventure.scenes" :key="scene.id" :value="`scene:${scene.id}`">
                {{ scene.title }}
              </option>
            </optgroup>
            <optgroup v-if="adventure.npcs.length > 0" :label="t('clues.fromNpc')">
              <option v-for="npc in adventure.npcs" :key="npc.id" :value="`npc:${npc.id}`">
                {{ npc.name }}
              </option>
            </optgroup>
          </select>
          <button
            class="small danger"
            type="button"
            :aria-label="t('common.remove')"
            @click="clue.leads.splice(i, 1)"
          >
            ×
          </button>
        </li>
      </ul>
      <form class="row" @submit.prevent="addLead">
        <input v-model="newLead" class="grow" :placeholder="t('clues.newLead')" />
        <button class="small" type="submit" :disabled="!newLead.trim()">
          {{ t('clues.addLead') }}
        </button>
      </form>
      <div v-if="clue.leads.length === 0 && noteBullets.length > 0" class="row">
        <button class="small" type="button" @click="leadsFromNotes">
          {{ t('clues.leadsFromNotes', noteBullets.length) }}
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend><MapPin aria-hidden="true" />{{ t('clues.scenes') }}</legend>
      <p class="hint">{{ t('clues.scenesHint') }}</p>
      <div class="row">
        <label v-for="scene in adventure.scenes" :key="scene.id" class="chip">
          <input
            type="checkbox"
            :checked="clue.sceneIds.includes(scene.id)"
            @change="toggle(clue.sceneIds, scene.id)"
          />
          {{ scene.title }}
        </label>
      </div>
      <p v-if="leadScenes.length > 0" class="hint">
        {{ t('clues.leadScenes', { scenes: leadScenes.map((s) => s.title).join(', ') }) }}
      </p>
    </fieldset>

    <label class="field">
      <span>{{ t('clues.notes') }}</span>
      <textarea v-model="clue.notes" rows="2" :placeholder="t('clues.notesHint')" />
      <small class="hint">{{ t('common.notesSyntax') }}</small>
    </label>
    <div class="row">
      <button class="danger" type="button" @click="emit('remove')">{{ t('clues.delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
.leads {
  margin: 0;
  padding: 0;
  list-style: none;
}

.leads li {
  gap: 0.4rem;
  align-items: start;
}

.grow {
  flex: 1 1 14rem;
  min-width: 0;
}

/* Long leads wrap instead of hiding behind the first line. */
.leads textarea {
  field-sizing: content;
}

.where {
  flex: 0 1 12rem;
  min-width: 0;
}
</style>
