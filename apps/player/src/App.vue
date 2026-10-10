<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n();
</script>

<template>
  <main>
    <h1>{{ t('app.title') }}</h1>
    <p>{{ t('app.tagline') }}</p>
    <p class="status">{{ t('app.status') }}</p>
    <label>
      {{ t('language') }}
      <select v-model="locale">
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
    <footer>
      <a href="https://github.com/mLampir/lorewarden">{{ t('sourceCode') }}</a>
    </footer>
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  max-width: 40rem;
  margin: 4rem auto;
  padding: 0 1rem;
}

footer {
  margin-top: 3rem;
  font-size: 0.875rem;
}

.status {
  opacity: 0.7;
}
</style>
