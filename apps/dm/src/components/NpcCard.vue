<script setup lang="ts">
import type { Npc } from '@lorewarden/core';

defineProps<{ npc: Npc }>();
</script>

<template>
  <article class="card entity">
    <header>
      <h3>{{ npc.name }}</h3>
      <span v-if="npc.role" class="muted">{{ npc.role }}</span>
    </header>
    <p v-if="npc.description">{{ npc.description }}</p>
    <p v-if="npc.notes" class="secret">{{ npc.notes }}</p>
    <div v-if="npc.tags.length > 0" class="row">
      <span v-for="tag in npc.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
    <div class="row actions"><slot /></div>
  </article>
</template>
