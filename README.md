# Lorewarden

A local-first toolkit for game masters of 5e-compatible tabletop RPGs: prepare your story, find the right thing at the table in one or two clicks, and react to your players.

> **Status:** early development (Phase 1). The game master app can prepare and run an adventure; everything else is still to come. See the [roadmap](#roadmap).

## Principles

- **Game master first.** The player side is an extra, never a requirement.
- **Fast at the table.** Everything in live mode is one or two clicks away.
- **Local-first.** Your data stays in your browser and can be exported as JSON. No account, no cloud.
- **No autopilot.** AI helps with improvisation and names; the game master decides.
- **Only openly licensed content.** Rules content comes from the SRD under CC BY 4.0. Anything else you type in or import yourself.

## Roadmap

| Phase | Goal |
|---|---|
| 0 | Repository, CI and the data model in `packages/core` |
| 1 | MVP for the game master: scene graph editor, live mode, session log, initiative tracker, NPC and loot cards, JSON export/import |
| 2 | Monster library (Open5e import, custom monsters), adventure monster pool with stand-ins, encounter generator |
| 3 | AI helper: an MCP server that lets AI assistants such as the Claude app read and update the current adventure (names, room descriptions, "what now?", stand-in suggestions); optional quick actions in the app with your own API key |
| 4 | Player web app: join by QR code, reveals (handouts, hints, images) to everyone or single players |
| 5 | Second-screen display, plugins, Docker image |

Out of scope: character sheets and dice rollers (players keep using their own tools, e.g. D&D Beyond), map editors, a complete virtual tabletop and rules automation.

## What works today

The game master app (`pnpm dev`):

- **Adventure library:** create adventures, import and export them as JSON, load the example adventure.
- **Scene graph editor:** scenes with read-aloud text, private notes, NPCs, loot and exits. The graph shows how scenes connect and flags scenes the party cannot reach.
- **NPC and loot cards:** write them once, give NPCs a voice note for how to play them and place them in any number of scenes.
- **Live mode:** the current scene with its exits as buttons, its NPCs, loot and encounters; jump to any scene or open the map.
- **Session log:** scene changes are logged automatically, add notes in one line, export the log as Markdown.
- **Initiative tracker:** rounds and turns, hit points, SRD conditions; add an encounter's monsters or a scene's NPCs with one click. Player characters stay for the whole session.

Everything is stored in your browser (IndexedDB). Export your adventures to back them up.

## Repository layout

```
apps/
  dm/          Game master web app (laptop/tablet)
  player/      Player web app (phone)
packages/
  core/        Data model, validation and rules math (plain TypeScript, no UI)
examples/      Example adventures written for this project
```

More packages (`content`, `mcp`, `server`) follow in later phases.

## Development

Requirements: Node.js 22 or newer and [pnpm](https://pnpm.io) (`corepack enable` installs the right version).

```sh
pnpm install
pnpm dev          # game master app on http://localhost:5173
pnpm dev:player   # player app on http://localhost:5174
pnpm test
pnpm lint
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Copyright (C) 2026 Lampir (https://lampir.at)

- **Code:** GNU Affero General Public License, version 3 or (at your option) any later version, see [LICENSE](LICENSE). If you run a modified version as a service for others, you must offer them its source code. The project comes without any warranty.
- **Example adventures** in `examples/`: [CC BY 4.0](examples/LICENSE.md).
- **Rules content** from the System Reference Document will be credited here and in the app once it is included.

Much of the code is created with Claude.

Lorewarden is unofficial fan content and is not affiliated with, endorsed, sponsored or approved by Wizards of the Coast.
