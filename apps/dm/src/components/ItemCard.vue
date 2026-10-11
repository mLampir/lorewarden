<script setup lang="ts">
import type { Item } from '@lorewarden/core';
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
    <p v-if="item.notes" class="secret"><TermText :text="item.notes" /></p>
    <div class="row actions"><slot /></div>
  </article>
</template>
