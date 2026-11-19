<script setup lang="ts">
import { MessageSquare } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { type ClaudeTask, openInClaude, taskValues } from '../lib/claude';

/**
 * Hands an AI task to the game master's AI assistant as set in the settings. With Claude, a
 * button opens a chat whose message asks Claude to fetch the instructions with the Lorewarden
 * connector, and Claude saves the result itself. Otherwise the slot shows the copy-and-paste way.
 */
const props = defineProps<{
  /** The task and its values, passed on to get_instructions. */
  task: ClaudeTask;
  /** What the game master asks for, one sentence at the top of the message. */
  request: string;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
}>();
const { t } = useI18n();
const { aiChat } = useSettings();

const opened = ref(false);
const app = computed(() => (aiChat.value === 'copy' ? undefined : aiChat.value));

function open() {
  if (!app.value) return;
  const message = t('ai.message', { request: props.request, values: taskValues(props.task) });
  openInClaude(message, app.value);
  opened.value = true;
}
</script>

<template>
  <div v-if="app" class="stack">
    <div class="row">
      <button type="button" :class="{ primary, small }" :disabled="disabled" @click="open">
        <MessageSquare aria-hidden="true" />{{ t('ai.openInClaude') }}
      </button>
    </div>
    <p v-if="opened" class="hint" role="status">{{ t('ai.opened') }}</p>
    <p v-else class="hint">
      {{ t('ai.claudeHint') }}
      <RouterLink :to="{ name: 'settings' }">{{ t('ai.change') }}</RouterLink>
    </p>
  </div>
  <slot v-else />
</template>

