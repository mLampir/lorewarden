<script setup lang="ts">
import { watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';

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
        <label class="inline">
          <span class="sr-only">{{ t('language') }}</span>
          <select v-model="locale" :aria-label="t('language')">
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
        <a href="https://github.com/mLampir/lorewarden" class="muted">{{ t('sourceCode') }}</a>
      </div>
    </header>
    <RouterView />
  </div>
</template>
