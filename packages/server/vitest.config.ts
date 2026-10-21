import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every sign-in hashes the password with scrypt on purpose, so tests that sign in several
    // times take seconds on a busy CI runner and would trip the default timeout of 5 seconds.
    testTimeout: 30_000,
  },
});
