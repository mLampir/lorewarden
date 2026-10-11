<script setup lang="ts">
import { watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverStatus } from './lib/server';

const { t, locale } = useI18n();

watchEffect(() => {
  document.documentElement.lang = locale.value;
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">{{ t('app.title') }}</RouterLink>
      <div class="topbar-actions">
        <a href="https://github.com/mLampir/lorewarden" class="muted">{{ t('sourceCode') }}</a>
        <RouterLink
          :to="{ name: 'settings' }"
          class="icon-link"
          :title="t('settings.heading')"
          :aria-label="t('settings.heading')"
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
        </RouterLink>
      </div>
    </header>
    <p v-if="serverStatus === 'offline'" class="offline" role="alert">
      {{ t('server.offline') }}
    </p>
    <RouterView />
  </div>
</template>
