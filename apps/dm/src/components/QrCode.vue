<script setup lang="ts">
import { encode } from 'uqr';
import { computed } from 'vue';

const props = defineProps<{ value: string; label: string }>();

const qr = computed(() => {
  const { data, size } = encode(props.value, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    });
  });
  return { size, path };
});
</script>

<template>
  <!-- Always dark on light, also in dark mode, so every phone camera can read it. -->
  <svg
    class="qr"
    role="img"
    :aria-label="label"
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    shape-rendering="crispEdges"
  >
    <rect :width="qr.size" :height="qr.size" fill="#fff" />
    <path :d="qr.path" fill="#000" />
  </svg>
</template>

<style scoped>
.qr {
  display: block;
  width: 100%;
  max-width: 16rem;
  height: auto;
  border-radius: var(--radius);
}
</style>
