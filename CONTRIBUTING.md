# Contributing to Lorewarden

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Issues labelled `good first issue` are a good place to start.
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```sh
corepack enable
pnpm install
pnpm test
```

## Pull requests

- Keep each pull request focused on one change.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check:privacy` before pushing. `pnpm format` fixes most lint findings.
- Add or update tests for changes in `packages/core`.
- Write user-facing text through i18n and add both English and German strings. If you do not speak German, add the English text to both files and mention it in the pull request.
- For interface changes, follow the [design guidelines](docs/design.md).

## Content rules

Lorewarden must stay free of protected content:

- Only use rules content from the SRD (CC BY 4.0) or other content whose license allows it, and credit the source.
- Never copy stat blocks, text or images from commercial books or from D&D Beyond.
- Example adventures must be your own writing and are published under CC BY 4.0.
- Use made-up data in tests and screenshots. Never commit API keys, personal exports or personal data.

## Licensing of contributions

By submitting a contribution, you agree that it is licensed under the project's licenses: AGPL-3.0-or-later for code and CC BY 4.0 for content in `examples/`. You keep the copyright to your work.

## Privacy tip

Your commits show the name and email from your git config. If you want to keep your email private, use your GitHub noreply address (GitHub → Settings → Emails).
