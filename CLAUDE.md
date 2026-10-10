# CLAUDE.md

Guidance for AI coding assistants working in this repository. Read README.md and CONTRIBUTING.md too.

## This repository is public: no personal data

Everything committed here is public forever, including git history. Never write any of the following into files, commit messages, pull request texts, issues or code comments:

- Real names of the maintainer, contributors or players, and addresses to them ("remind <name>", "ask <name>", "TODO for <name>"). Write neutral TODOs instead, e.g. `// TODO: handle empty scenes`.
- Email addresses, phone numbers, postal addresses, usernames on other services.
- Local paths such as home directories on Linux, macOS or Windows, machine names, IP addresses of private networks.
- API keys, tokens, passwords, `.env` contents, real exported adventures or session logs.
- References to private chats, project threads or other private tools.

The only identity that appears in the repository is the copyright holder **Lampir** (https://lampir.at). Commits use the GitHub noreply address; do not change the git author.

Notes meant for the maintainer go into the chat or the pull request conversation, not into the code.

Review the full diff for personal data before every commit and push. `pnpm check:privacy` scans tracked files for local paths and email addresses and runs in CI.

## Content rules

- Only SRD content (CC BY 4.0) or other openly licensed content, always with source attribution.
- Never copy stat blocks, text or images from commercial books or D&D Beyond.
- Example adventures in `examples/` are original writing under CC BY 4.0.
- Do not use "D&D" or Wizards of the Coast trademarks in names; say "5e-compatible".

## Project conventions

- pnpm workspace: `apps/dm`, `apps/player` (Vue 3 + Vite), `packages/core` (plain TypeScript, no UI, zod schemas).
- Before finishing a change, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check:privacy`.
- All user-facing text goes through vue-i18n with English and German strings.
- Code, comments, commits and docs are in English.
- Code license is AGPL-3.0-or-later; keep the source-code link in both apps.
