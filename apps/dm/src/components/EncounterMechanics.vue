<script setup lang="ts">
import {
  type Adventure,
  createId,
  type Encounter,
  type EncounterMechanic,
  type EncounterObject,
  MechanicTrigger,
  releaseMechanicTargets,
} from '@lorewarden/core';
import { Shield, X, Zap } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { fillIfBlank } from '../lib/fallback';
import { mechanicTargets } from '../lib/mechanics';

const props = defineProps<{ adventure: Adventure; encounter: Encounter }>();

const { t } = useI18n();
const { term } = useSettings();

const targets = computed(() => mechanicTargets(props.adventure, props.encounter));

function addObject() {
  props.encounter.objects.push({ id: createId('obj'), name: t('mechanics.newObject'), hp: 10 });
}

function removeObject(object: EncounterObject) {
  const { encounter } = props;
  encounter.objects = encounter.objects.filter((o) => o.id !== object.id);
  // Triggers watching the object go back to the game master.
  encounter.mechanics = releaseMechanicTargets(encounter);
}

function setNumber(object: EncounterObject, field: 'ac' | 'hp', event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (field === 'hp') object.hp = value > 0 ? value : object.hp;
  else if (value >= 0) object.ac = value;
  else delete object.ac;
}

function setDescription(object: EncounterObject, event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value) object.description = value;
  else delete object.description;
}

function addMechanic() {
  props.encounter.mechanics.push({
    id: createId('mech'),
    trigger: 'round',
    round: 3,
    text: t('mechanics.newText'),
  });
}

/** Fills in what the chosen trigger needs, so the encounter stays valid. */
function setTrigger(mechanic: EncounterMechanic, event: Event) {
  const trigger = MechanicTrigger.parse((event.target as HTMLSelectElement).value);
  mechanic.trigger = trigger;
  if (trigger === 'round') mechanic.round ??= 1;
  else delete mechanic.round;
  if (trigger === 'bloodied' || trigger === 'defeated') {
    if (!targets.value.some((target) => target.id === mechanic.target)) {
      mechanic.target = targets.value[0]?.id;
    }
    if (mechanic.target === undefined) mechanic.trigger = 'manual';
  } else delete mechanic.target;
}

function setRound(mechanic: EncounterMechanic, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  mechanic.round = value >= 1 ? value : 1;
}
</script>

<template>
  <div class="stack mechanics">
    <div v-if="encounter.objects.length > 0" class="stack">
      <h4 class="section-title"><Shield aria-hidden="true" />{{ t('mechanics.objects') }}</h4>
      <div v-for="object in encounter.objects" :key="object.id" class="object">
        <label class="field name">
          <span>{{ t('mechanics.name') }}</span>
          <input
            v-model="object.name"
            required
            @blur="fillIfBlank(object, 'name', t('mechanics.newObject'))"
          />
        </label>
        <label class="field">
          <span>{{ term('statBlock.ac') }}</span>
          <input
            type="number"
            min="0"
            :value="object.ac ?? ''"
            @change="setNumber(object, 'ac', $event)"
          />
        </label>
        <label class="field">
          <span>{{ term('statBlock.hp') }}</span>
          <input
            type="number"
            min="1"
            :value="object.hp"
            @change="setNumber(object, 'hp', $event)"
          />
        </label>
        <label class="field description">
          <span>{{ t('mechanics.description') }}</span>
          <input :value="object.description ?? ''" @change="setDescription(object, $event)" />
        </label>
        <button
          type="button"
          class="small ghost icon-only"
          :title="t('common.remove')"
          :aria-label="t('common.remove')"
          @click="removeObject(object)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="encounter.mechanics.length > 0" class="stack">
      <h4 class="section-title"><Zap aria-hidden="true" />{{ t('mechanics.heading') }}</h4>
      <div v-for="mechanic in encounter.mechanics" :key="mechanic.id" class="mechanic">
        <label class="field trigger">
          <span>{{ t('mechanics.trigger') }}</span>
          <select :value="mechanic.trigger" @change="setTrigger(mechanic, $event)">
            <option v-for="trigger in MechanicTrigger.options" :key="trigger" :value="trigger">
              {{ t(`mechanics.triggers.${trigger}`) }}
            </option>
          </select>
        </label>
        <label v-if="mechanic.trigger === 'round'" class="field when">
          <span>{{ t('mechanics.round') }}</span>
          <input
            type="number"
            min="1"
            :value="mechanic.round ?? 1"
            @change="setRound(mechanic, $event)"
          />
        </label>
        <label
          v-else-if="mechanic.trigger === 'bloodied' || mechanic.trigger === 'defeated'"
          class="field when"
        >
          <span>{{ t('mechanics.target') }}</span>
          <select v-model="mechanic.target">
            <option v-for="target in targets" :key="target.id" :value="target.id">
              {{ target.name }}
            </option>
          </select>
        </label>
        <span v-else class="when" />
        <label class="field text">
          <span>{{ t('mechanics.text') }}</span>
          <textarea
            v-model="mechanic.text"
            rows="2"
            class="secret-input"
            required
            @blur="fillIfBlank(mechanic, 'text', t('mechanics.newText'))"
          />
        </label>
        <button
          type="button"
          class="small ghost icon-only"
          :title="t('common.remove')"
          :aria-label="t('common.remove')"
          @click="encounter.mechanics = encounter.mechanics.filter((m) => m.id !== mechanic.id)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>

    <p v-if="encounter.mechanics.length === 0" class="hint">{{ t('mechanics.hint') }}</p>
    <div class="row">
      <button type="button" class="small" @click="addMechanic">
        <Zap aria-hidden="true" />{{ t('mechanics.add') }}
      </button>
      <button type="button" class="small" @click="addObject">
        <Shield aria-hidden="true" />{{ t('mechanics.addObject') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mechanics h4 {
  margin: 0;
}

.object,
.mechanic {
  display: grid;
  gap: 0.4rem;
}

.object {
  grid-template-columns: 2fr 4.5rem 4.5rem 3fr auto;
  grid-template-areas: 'name ac hp description remove';
  align-items: end;
}

.mechanic {
  grid-template-columns: 12rem 10rem 1fr auto;
  grid-template-areas: 'trigger when text remove';
  align-items: start;
}

.object > *,
.mechanic > * {
  min-width: 0;
}

.object input,
.mechanic select,
.mechanic input {
  width: 100%;
}

.name {
  grid-area: name;
}

.description {
  grid-area: description;
}

.trigger {
  grid-area: trigger;
}

.when {
  grid-area: when;
}

.text {
  grid-area: text;
}

.mechanic > button,
.object > button {
  grid-area: remove;
  align-self: center;
}

@media (max-width: 640px) {
  .object {
    grid-template-columns: 1fr 1fr auto;
    grid-template-areas:
      'name name remove'
      'ac hp hp'
      'description description description';
  }

  .object > label:nth-child(2) {
    grid-area: ac;
  }

  .object > label:nth-child(3) {
    grid-area: hp;
  }

  .mechanic {
    grid-template-columns: 1fr 1fr auto;
    grid-template-areas:
      'trigger when remove'
      'text text text';
  }
}
</style>
