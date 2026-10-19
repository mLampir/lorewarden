<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { listAdventures } from '../storage/database';

/** Shown instead of an adventure that could not be loaded, with the reason when it is known. */
const props = defineProps<{ id: string }>();
const { t } = useI18n();

/** The server lists the adventure, but this app cannot read what it sends. */
const unreadable = ref(false);

onMounted(async () => {
  const listed = await listAdventures().catch(() => []);
  unreadable.value = listed.some((a) => a.id === props.id);
});
</script>

<template>
  <div class="stack">
    <p v-if="unreadable" class="error" role="alert">{{ t('common.unreadable') }}</p>
    <p v-else>{{ t('common.notFound') }}</p>
    <RouterLink to="/">{{ t('common.backToLibrary') }}</RouterLink>
  </div>
</template>
