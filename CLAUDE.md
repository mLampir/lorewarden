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

Review the full diff for personal data before every commit and push. `pnpm check:privacy` scans tracked files for local paths, email addresses and private IP addresses and runs in CI.

## Content rules

- Only SRD content (CC BY 4.0) or other openly licensed content, always with source attribution.
- Never copy stat blocks, text or images from commercial books or D&D Beyond.
- Example adventures in `examples/` are original writing under CC BY 4.0.
- Do not use "D&D" or Wizards of the Coast trademarks in names; say "5e-compatible".

## Project conventions

- pnpm workspace: `apps/dm`, `apps/player` (Vue 3 + Vite), `packages/core` (plain TypeScript, no UI, zod schemas).
- Before finishing a change, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check:privacy`.
- All user-facing text goes through vue-i18n with English and German strings.
- Rules terms in the interface (AC, HP, level, class, passive Perception, initiative, conditions, stat block fields) go through `term()` from `useSettings` in the game master app, not `t()`, so they follow the setting for English rules terms. Screens on the players' phones that show rules terms follow the same setting, which the server passes on with the view.
- Code, comments, commits and docs are in English.
- Code license is AGPL-3.0-or-later; keep the source-code link in both apps.
- UI work follows `docs/design.md`: reuse the tokens and shared components in `apps/dm/src/styles.css`, Lucide icons, and go through its checklist.
- Keep the documentation in step with the code. When a change adds, removes or changes something users or contributors notice, update the affected docs in the same pull request: `README.md` (features, getting started, commands, repository layout), `docs/self-hosting.md`, `packages/mcp/README.md` (tools and prompts), `CONTRIBUTING.md` and this file. Retake the screenshots in `docs/images` from the example adventure when the screens they show change visibly. Planned work belongs in GitHub issues, not in the README.
