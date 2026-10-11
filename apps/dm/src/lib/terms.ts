import type { TermIndex } from '@lorewarden/core';
import type { InjectionKey, Ref } from 'vue';

/** Rules terms and creature names of the adventure being played, for TermText. */
export const termIndexKey: InjectionKey<Ref<TermIndex | undefined>> = Symbol('termIndex');
