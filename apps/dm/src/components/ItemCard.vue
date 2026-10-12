<script setup lang="ts">
import type { Item } from '@lorewarden/core';
import NotesText from './NotesText.vue';
import TermText from './TermText.vue';

defineProps<{ item: Item }>();
</script>

<template>
  <article class="card entity">
    <header>
      <h3>{{ item.name }}</h3>
      <span v-if="item.rarity" class="muted">{{ item.rarity }}</span>
    </header>
    <p v-if="item.description"><TermText :text="item.description" /></p>
    <NotesText v-if="item.notes" class="secret" :text="item.notes" />
    <div class="row actions"><slot /></div>
  </article>
</template>
