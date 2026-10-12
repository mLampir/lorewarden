<script setup lang="ts">
import type { Party, Player, Session } from '@lorewarden/core';
import {
  Backpack,
  Eye,
  Heart,
  MessageSquare,
  Pencil,
  Shield,
  Smartphone,
  Swords,
  Target,
} from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import NotesText from './NotesText.vue';

/**
 * The player characters at a glance in live mode: armor class, passive Perception, hit points
 * while the game master tracks them, the notes on what each player enjoys, and what the
 * characters want and where they come from, to weave into the scene.
 */
const props = defineProps<{ party: Party; session: Session; players: Player[] }>();
const emit = defineEmits<{ addParty: [] }>();
const { t } = useI18n();
const { term } = useSettings();

const characters = computed(() =>
  props.party.characters.map((character) => {
    const combatant = props.session.initiative.find(
      (c) => c.kind === 'pc' && c.ref === character.id,
    );
    const name = character.name.trim().toLocaleLowerCase();
    // Picked on the phone, or joined with the character's name.
    const online = props.players.some(
      (p) =>
        p.characterId === character.id ||
        (!p.characterId && p.name.trim().toLocaleLowerCase() === name),
    );
    return { character, combatant, online };
  }),
);

const missing = computed(() => characters.value.filter((c) => !c.combatant).length);
</script>

<template>
  <div class="stack party-panel">
    <div class="row spread">
      <h3 class="section-title">
        <Backpack aria-hidden="true" />{{ party.name }}<span class="count">{{ party.characters.length }}</span>
      </h3>
      <RouterLink
        class="ghost-link"
        :to="{ name: 'party', query: { id: party.id } }"
        :title="t('party.edit')"
        :aria-label="t('party.edit')"
      >
        <Pencil aria-hidden="true" />
      </RouterLink>
    </div>
    <button v-if="missing > 0" class="small" @click="emit('addParty')">
      <Swords aria-hidden="true" />{{ t('party.addToInitiative', { count: missing }) }}
    </button>
    <p v-if="party.characters.length === 0" class="hint">{{ t('party.empty') }}</p>
    <article v-for="{ character, combatant, online } in characters" :key="character.id" class="card pc">
      <header class="pc-head">
        <h4>{{ character.name }}</h4>
        <span v-if="character.player" class="muted">{{ character.player }}</span>
        <Smartphone
          v-if="online"
          class="online"
          :aria-label="t('party.online')"
          :title="t('party.online')"
        />
      </header>
      <p class="muted pc-class">
        {{ [character.className, term('party.levelShort', { level: character.level })].filter(Boolean).join(' · ') }}
      </p>
      <ul class="stats">
        <li v-if="character.ac !== undefined" :title="term('statBlock.ac')">
          <Shield aria-hidden="true" />{{ term('statBlock.ac') }} {{ character.ac }}
        </li>
        <li v-if="character.passivePerception !== undefined" :title="term('party.passivePerception')">
          <Eye aria-hidden="true" />{{ character.passivePerception }}
        </li>
        <li v-if="combatant?.hp" class="hp" :class="{ down: combatant.hp.current === 0 }">
          <Heart aria-hidden="true" />{{ combatant.hp.current }}/{{ combatant.hp.max }}
        </li>
        <li v-else-if="character.maxHp !== undefined" :title="term('initiative.hp')">
          <Heart aria-hidden="true" />{{ character.maxHp }}
        </li>
        <li v-if="combatant?.conditions.length" class="conditions">
          {{ combatant.conditions.join(', ') }}
        </li>
      </ul>
      <NotesText v-if="character.notes" class="secret" :text="character.notes" />
      <p v-if="character.goals" class="goals">
        <Target aria-hidden="true" /><span><strong>{{ t('party.goals') }}:</strong> {{ character.goals }}</span>
      </p>
      <details v-if="character.backstory" class="backstory">
        <summary>{{ t('party.backstory') }}</summary>
        <p>{{ character.backstory }}</p>
      </details>
      <p v-if="character.playerNotes" class="from-player">
        <MessageSquare aria-hidden="true" />{{ character.playerNotes }}
      </p>
    </article>
  </div>
</template>

<style scoped>
.party-panel > button {
  align-self: flex-start;
}

.spread {
  justify-content: space-between;
  align-items: center;
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

.pc {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--ok);
}

.pc-head {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.pc-head h4 {
  margin: 0;
  font-size: 1rem;
}

.pc-class {
  margin: 0;
  font-size: 0.875rem;
}

.online {
  align-self: center;
  width: 0.9rem;
  height: 0.9rem;
  color: var(--ok);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stats li {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.stats svg {
  width: 0.85rem;
  height: 0.85rem;
  color: var(--muted);
}

.hp.down {
  color: var(--danger);
}

.secret {
  margin: 0.2rem 0 0;
}

.goals,
.from-player {
  display: flex;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.875rem;
  color: var(--muted);
  white-space: pre-line;
}

.goals {
  color: var(--text);
}

.backstory {
  font-size: 0.875rem;
}

.backstory summary {
  cursor: pointer;
  color: var(--muted);
}

.backstory p {
  margin: 0.25rem 0 0;
  white-space: pre-line;
}

.goals svg,
.from-player svg {
  flex: none;
  width: 0.9rem;
  height: 0.9rem;
  margin-top: 0.2rem;
}
</style>
