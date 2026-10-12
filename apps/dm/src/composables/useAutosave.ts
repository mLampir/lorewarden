import { onBeforeUnmount, type Ref, ref, watch } from 'vue';

const DELAY_MS = 400;

/**
 * Saves the value shortly after every change and once more when the view closes.
 * The first value seen after a load is not saved again.
 */
export function useAutosave<T>(source: Ref<T | undefined>, save: (value: T) => Promise<void>) {
  const failed = ref(false);
  /** True from a change until it is saved, for a "Saving…" hint. */
  const pending = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = '';

  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    const value = source.value;
    if (value === undefined) return;
    const json = JSON.stringify(value);
    if (json === lastSaved) {
      pending.value = false;
      return;
    }
    try {
      await save(value);
      lastSaved = json;
      failed.value = false;
    } catch {
      failed.value = true;
    }
    pending.value = timer !== undefined;
  };

  /** Call after loading a value from storage so it is not written back unchanged. */
  const markSaved = (value: T | undefined) => {
    lastSaved = value === undefined ? '' : JSON.stringify(value);
  };

  watch(
    source,
    () => {
      clearTimeout(timer);
      if (source.value !== undefined && JSON.stringify(source.value) !== lastSaved)
        pending.value = true;
      timer = setTimeout(flush, DELAY_MS);
    },
    { deep: true },
  );

  const onPageHide = () => void flush();
  window.addEventListener('pagehide', onPageHide);
  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', onPageHide);
    void flush();
  });

  return { failed, pending, markSaved, flush };
}
