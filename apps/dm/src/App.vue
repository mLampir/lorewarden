<script setup lang="ts">
import { computed, onBeforeUnmount, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import AuthorizeApp from './components/AuthorizeApp.vue';
import SignIn from './components/SignIn.vue';
import { authStatus, loadAuthStatus } from './lib/auth';
import { connectToServer, disconnectFromServer, serverStatus, updateInfo } from './lib/server';

const { t, locale } = useI18n();

/** An AI assistant asks to be allowed in, see AuthorizeApp. */
const authorizing = window.location.pathname === '/oauth/authorize';

const settingsLabel = computed(() =>
  updateInfo.value.latest
    ? t('settings.updateAvailable', { version: updateInfo.value.latest })
    : t('settings.heading'),
);

watchEffect(() => {
  document.documentElement.lang = locale.value;
});

// The app asks whether it may be used here before it loads anything, and tries again while the
// server is not running.
let retry: ReturnType<typeof setTimeout> | undefined;
async function checkAccess() {
  if (!(await loadAuthStatus())) retry = setTimeout(checkAccess, 3000);
}
void checkAccess();
onBeforeUnmount(() => clearTimeout(retry));

watch(
  () => authStatus.value?.access,
  (access) => (access && !authorizing ? connectToServer() : disconnectFromServer()),
);
</script>

<template>
  <p v-if="!authStatus" class="offline" role="alert">{{ t('server.offline') }}</p>
  <SignIn v-else-if="!authStatus.access" :status="authStatus" />
  <AuthorizeApp v-else-if="authorizing" />
  <div v-else class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">{{ t('app.title') }}</RouterLink>
      <div class="topbar-actions">
        <RouterLink :to="{ name: 'monsters' }" class="muted">{{ t('monsters.heading') }}</RouterLink>
        <a href="https://github.com/mLampir/lorewarden" class="muted">{{ t('sourceCode') }}</a>
        <RouterLink
          :to="{ name: 'settings' }"
          class="icon-link"
          :title="settingsLabel"
          :aria-label="settingsLabel"
        >
          <!-- Icon "settings" from Lucide (ISC License), see THIRD-PARTY-NOTICES.md. -->
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
            />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          <span v-if="updateInfo.latest" class="update-dot" aria-hidden="true"></span>
        </RouterLink>
      </div>
    </header>
    <p v-if="serverStatus === 'offline'" class="offline" role="alert">
      {{ t('server.offline') }}
    </p>
    <RouterView />
  </div>
</template>
