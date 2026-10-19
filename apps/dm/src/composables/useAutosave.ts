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
  /** The save in progress; the next one waits for it so an older value never lands last. */
  let saving: Promise<void> = Promise.resolve();

  const saveNow = async (value: T, json: string) => {
    if (json === lastSaved) {
      pending.value = timer !== undefined;
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

  /**
   * Saves the value as it is now, after the save in progress, if any, has finished. Saves run one
   * after another, so a timer and a closing view never race and the newest value lands last.
   */
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    const value = source.value;
    if (value === undefined) return saving;
    const json = JSON.stringify(value);
    saving = saving.then(() => saveNow(value, json));
    return saving;
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
