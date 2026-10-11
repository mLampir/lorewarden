import { createRouter, createWebHashHistory } from 'vue-router';
import LibraryView from './views/LibraryView.vue';

export const router = createRouter({
  // Hash URLs work on any static host without server configuration.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'library', component: LibraryView },
    {
      path: '/adventures/:id/edit',
      name: 'edit',
      component: () => import('./views/EditorView.vue'),
      props: true,
    },
    {
      path: '/adventures/:id/play',
      name: 'play',
      component: () => import('./views/LiveView.vue'),
      props: true,
    },
    {
      path: '/monsters',
      name: 'monsters',
      component: () => import('./views/MonstersView.vue'),
    },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
