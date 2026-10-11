import { createApp, watch } from 'vue';
import App from './App.vue';
import { adventureLanguages } from './composables/useSettings';
import { i18n } from './i18n';
import { onConnected } from './lib/server';
import { router } from './router';
import { saveAiSettings } from './storage/database';
import './styles.css';

createApp(App).use(i18n).use(router).mount('#app');

// AI assistants write new adventures in the languages chosen in the settings.
const shareLanguages = () => void saveAiSettings(adventureLanguages()).catch(() => undefined);
watch(adventureLanguages, shareLanguages, { deep: true });
onConnected(shareLanguages);
