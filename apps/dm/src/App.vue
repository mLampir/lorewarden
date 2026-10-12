<script setup lang="ts">
import { BookOpen, ScrollText, Settings, Skull } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AuthorizeApp from './components/AuthorizeApp.vue';
import SignIn from './components/SignIn.vue';
import { authStatus, loadAuthStatus } from './lib/auth';
import { connectToServer, disconnectFromServer, serverStatus, updateInfo } from './lib/server';

const { t, locale } = useI18n();
const route = useRoute();

/** The part of the app the current page belongs to, highlighted in the navigation. */
const section = computed(() => {
  if (route.name === 'monsters') return 'monsters';
  if (route.name === 'settings') return 'settings';
  return 'adventures';
});

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
// server is not running. It says the server cannot be reached only once a request has failed,
// not while the first answer is still on its way, which takes a moment on a hosted server.
const unreachable = ref(false);
let retry: ReturnType<typeof setTimeout> | undefined;
async function checkAccess() {
  if (await loadAuthStatus()) return;
  unreachable.value = true;
  retry = setTimeout(checkAccess, 3000);
}
void checkAccess();
onBeforeUnmount(() => clearTimeout(retry));

watch(
  () => authStatus.value?.access,
  (access) => (access && !authorizing ? connectToServer() : disconnectFromServer()),
);
</script>

<template>
  <template v-if="!authStatus">
    <p v-if="unreachable" class="offline" role="alert">{{ t('server.offline') }}</p>
  </template>
  <SignIn v-else-if="!authStatus.access" :status="authStatus" />
  <AuthorizeApp v-else-if="authorizing" />
  <div v-else class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">
        <span class="brand-mark" aria-hidden="true"><ScrollText :size="18" /></span>
        {{ t('app.title') }}
      </RouterLink>
      <nav class="nav" :aria-label="t('nav.label')">
        <RouterLink to="/" :class="{ active: section === 'adventures' }">
          <BookOpen :size="18" aria-hidden="true" />
          <span class="label">{{ t('nav.adventures') }}</span>
        </RouterLink>
        <RouterLink :to="{ name: 'monsters' }" :class="{ active: section === 'monsters' }">
          <Skull :size="18" aria-hidden="true" />
          <span class="label">{{ t('monsters.heading') }}</span>
        </RouterLink>
        <RouterLink
          :to="{ name: 'settings' }"
          :class="{ active: section === 'settings' }"
          :title="settingsLabel"
        >
          <Settings :size="18" aria-hidden="true" />
          <span class="label">{{ settingsLabel }}</span>
          <span v-if="updateInfo.latest" class="update-dot" aria-hidden="true"></span>
        </RouterLink>
      </nav>
    </header>
    <p v-if="serverStatus === 'offline'" class="offline" role="alert">
      {{ t('server.offline') }}
    </p>
    <RouterView />
    <footer class="footer">
      <span>{{ t('app.title') }} · {{ t('footer.license') }}</span>
      <a href="https://github.com/mLampir/lorewarden">{{ t('sourceCode') }}</a>
    </footer>
  </div>
</template>
