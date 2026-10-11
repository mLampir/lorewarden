<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// An AI assistant such as Claude sent the game master here to be allowed to use Lorewarden's
// MCP endpoint (OAuth). The server checked the app and its return address already.

const { t } = useI18n();
const query = window.location.search.slice(1);

interface Request {
  clientName: string;
  redirectHost: string;
  needsPassword: boolean;
}

const request = ref<Request>();
const failed = ref(false);
const busy = ref(false);

onMounted(async () => {
  try {
    const response = await post('/api/oauth/check', { query });
    if (response.ok) request.value = (await response.json()) as Request;
    else failed.value = true;
  } catch {
    failed.value = true;
  }
});

function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function decide(allow: boolean) {
  busy.value = true;
  try {
    const response = await post('/api/oauth/decide', { query, allow });
    if (!response.ok) throw new Error(String(response.status));
    const { redirect } = (await response.json()) as { redirect: string };
    window.location.assign(redirect);
  } catch {
    failed.value = true;
    busy.value = false;
  }
}
</script>

<template>
  <main class="page authorize">
    <h1>{{ t('app.title') }}</h1>
    <section class="card stack">
      <template v-if="failed">
        <h2>{{ t('connect.failedHeading') }}</h2>
        <p>{{ t('connect.failed') }}</p>
      </template>
      <template v-else-if="request">
        <h2>{{ t('connect.heading', { app: request.clientName }) }}</h2>
        <p>{{ t('connect.what') }}</p>
        <p class="hint">{{ t('connect.returnTo', { host: request.redirectHost }) }}</p>
        <p v-if="request.needsPassword" class="error">{{ t('connect.needsPassword') }}</p>
        <div class="row">
          <button
            v-if="!request.needsPassword"
            type="button"
            class="primary"
            :disabled="busy"
            @click="decide(true)"
          >
            {{ t('connect.allow') }}
          </button>
          <button type="button" :disabled="busy" @click="decide(false)">
            {{ t('connect.deny') }}
          </button>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.authorize {
  max-width: 32rem;
  margin: 3rem auto;
}

.authorize h2 {
  margin: 0;
  font-size: 1.1rem;
}

.authorize p {
  margin: 0;
}
</style>
