import { onBeforeUnmount, type Ref } from 'vue';

/**
 * Asks the browser to confirm closing or reloading the tab while one of the given saves is still
 * waiting for its delay, so the last edit is not lost.
 */
export function useLeaveGuard(...pending: Ref<boolean>[]) {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!pending.some((p) => p.value)) return;
    event.preventDefault();
    // Older browsers only show the prompt when returnValue is set.
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
}
