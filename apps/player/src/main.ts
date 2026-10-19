import { createApp } from 'vue';
import '@fontsource-variable/inter';
// Before the components, whose own styles build on these.
import './styles.css';
import App from './App.vue';
import { i18n } from './i18n';

createApp(App).use(i18n).mount('#app');
