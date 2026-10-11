import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { bridgeSettings, startBridge } from './lib/bridge';
import { router } from './router';
import './styles.css';

createApp(App).use(i18n).use(router).mount('#app');

const bridge = bridgeSettings();
if (bridge.enabled) startBridge(bridge.port);
