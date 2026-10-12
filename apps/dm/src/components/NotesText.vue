<script setup lang="ts">
import { parseNotes } from '@lorewarden/core';
import { computed } from 'vue';
import TermText from './TermText.vue';

/** Notes with bullet points and **bold** key words, quick to scan at the table. */
const props = defineProps<{ text: string }>();

const blocks = computed(() => parseNotes(props.text));
</script>

<template>
  <div class="notes-text">
    <slot />
    <template v-for="(block, i) in blocks" :key="i">
      <ul v-if="block.kind === 'list'">
        <li v-for="(item, j) in block.items" :key="j">
          <template v-for="(span, k) in item" :key="k">
            <strong v-if="span.bold"><TermText :text="span.text" /></strong>
            <TermText v-else :text="span.text" />
          </template>
        </li>
      </ul>
      <p v-else>
        <template v-for="(line, j) in block.lines" :key="j">
          <br v-if="j > 0" />
          <template v-for="(span, k) in line" :key="k">
            <strong v-if="span.bold"><TermText :text="span.text" /></strong>
            <TermText v-else :text="span.text" />
          </template>
        </template>
      </p>
    </template>
  </div>
</template>
