<script setup lang="ts">
import { type Adventure, createMonster, type Monster } from '@lorewarden/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useSettings } from '../composables/useSettings';
import MonsterAi from './MonsterAi.vue';
import MonsterEditor from './MonsterEditor.vue';

const props = defineProps<{ adventure: Adventure }>();

const { t } = useI18n();
const { adventureLanguage, termsLanguage } = useSettings();
const library = useMonsterLibrary();

const selectedId = ref(props.adventure.monsters[0]?.id);
const writingWithAi = ref(false);
const saved = ref(false);

const selected = computed(() => props.adventure.monsters.find((m) => m.id === selectedId.value));
const usedBy = computed(() =>
  props.adventure.monsterPool.filter((p) => p.baseMonsterRef === selectedId.value),
);
const inLibrary = computed(() => library.monsters.value.some((m) => m.id === selectedId.value));
/** Library monsters the adventure does not have yet. */
const fromLibrary = computed(() =>
  library.monsters.value.filter((m) => !props.adventure.monsters.some((own) => own.id === m.id)),
);

watch(selectedId, () => {
  saved.value = false;
});

function add(monster: Monster) {
  props.adventure.monsters.push(monster);
  selectedId.value = monster.id;
  writingWithAi.value = false;
}

function copyFromLibrary(event: Event) {
  const select = event.target as HTMLSelectElement;
  const monster = library.monsters.value.find((m) => m.id === select.value);
  select.value = '';
  if (monster) add(structuredClone(monster));
}

async function saveToLibrary() {
  const monster = selected.value;
  if (!monster) return;
  if (inLibrary.value && !window.confirm(t('monsters.replaceConfirm', { name: monster.name }))) {
    return;
  }
  await library.save(monster);
  saved.value = true;
}

function remove() {
  const monster = selected.value;
  if (!monster) return;
  if (usedBy.value.length > 0) {
    window.alert(t('monsters.inUse', { names: usedBy.value.map((p) => p.name).join(', ') }));
    return;
  }
  if (!window.confirm(t('monsters.deleteConfirm', { name: monster.name }))) return;
  props.adventure.monsters = props.adventure.monsters.filter((m) => m.id !== monster.id);
  selectedId.value = props.adventure.monsters[0]?.id;
}
</script>

<template>
  <section class="master-detail">
    <div class="stack">
      <p class="hint">{{ t('monsters.adventureHint') }}</p>
      <div class="row">
        <button @click="add(createMonster(t('monsters.newName')))">{{ t('monsters.new') }}</button>
        <button @click="writingWithAi = true">{{ t('monsters.ai.open') }}</button>
      </div>
      <select v-if="fromLibrary.length > 0" :aria-label="t('monsters.fromLibrary')" @change="copyFromLibrary">
        <option value="">{{ t('monsters.fromLibrary') }}</option>
        <option v-for="monster in fromLibrary" :key="monster.id" :value="monster.id">
          {{ monster.name }}
        </option>
      </select>
      <ul class="list">
        <li v-for="monster in adventure.monsters" :key="monster.id">
          <button
            class="entry"
            :aria-current="monster.id === selectedId && !writingWithAi"
            @click="
              selectedId = monster.id;
              writingWithAi = false;
            "
          >
            {{ monster.name }}
          </button>
        </li>
      </ul>
    </div>
    <MonsterAi
      v-if="writingWithAi"
      :language="adventure.language ?? adventureLanguage"
      :terms-language="adventure.language ? adventure.termsLanguage : termsLanguage"
      @created="add"
    />
    <MonsterEditor v-else-if="selected" :key="selected.id" :monster="selected">
      <p class="hint">
        {{
          usedBy.length > 0
            ? t('monsters.usedBy', { names: usedBy.map((p) => p.name).join(', ') })
            : t('monsters.unused')
        }}
      </p>
      <p v-if="saved" class="hint" role="status">{{ t('monsters.savedToLibrary') }}</p>
      <div class="row">
        <button type="button" @click="saveToLibrary">
          {{ inLibrary ? t('monsters.updateLibrary') : t('monsters.saveToLibrary') }}
        </button>
        <button class="danger" type="button" @click="remove">{{ t('monsters.delete') }}</button>
      </div>
    </MonsterEditor>
    <p v-else class="muted">{{ t('monsters.noneInAdventure') }}</p>
  </section>
</template>
