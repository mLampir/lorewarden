import type { Adventure, ResolvedMonster } from '@lorewarden/core';
import { onBeforeUnmount, type Ref, ref, shallowRef } from 'vue';

/**
 * What the open page offers the quick search: the adventure it shows, whose scenes, NPCs and
 * items can be found, and what it does with them. A result without an action here opens its card
 * in the search itself.
 */
export interface QuickSearchPage {
  adventure: Ref<Adventure | undefined>;
  openScene?: (sceneId: string) => void;
  openNpc?: (npcId: string) => void;
  openItem?: (itemId: string) => void;
  /** Live mode puts NPCs and monsters into the initiative. */
  addNpcToInitiative?: (npcId: string) => void;
  /** ref is the id of the pool monster or of the monster's stat block. */
  addMonsterToInitiative?: (monster: ResolvedMonster, ref: string) => void;
}

const page = shallowRef<QuickSearchPage>();
const open = ref(false);

/** The quick search, opened with Ctrl+K or the button in the top bar. */
export function useQuickSearch() {
  return { page, open };
}

/** Lets the quick search find and open what the calling page shows, until the page is left. */
export function useQuickSearchPage(offer: QuickSearchPage) {
  page.value = offer;
  onBeforeUnmount(() => {
    if (page.value === offer) page.value = undefined;
  });
}
