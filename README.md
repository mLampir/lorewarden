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
| 2 | Monster library (Open5e import, custom monsters), adventure monster pool with stand-ins, encounter generator, rules terms and creature names in adventure text that show the rule or stat block on hover |
| 3 | AI helper: an MCP server that lets AI assistants such as the Claude app read and update the current adventure (names, room descriptions, "what now?", stand-in suggestions) and build a complete short adventure with you step by step; optional quick actions in the app with your own API key. A first step works without the server: the app copies instructions for the AI and imports its answer |
| 4 | Player web app: join by QR code, reveals (handouts, hints, images) to everyone or single players |
| 5 | Second-screen display, plugins, Docker image |

Out of scope: character sheets and dice rollers (players keep using their own tools, e.g. D&D Beyond), map editors, a complete virtual tabletop and rules automation.

## What works today

The game master app (`pnpm dev`):

- **Adventure library:** create adventures, import and export them as JSON, load the example adventure.
- **Scene graph editor:** scenes with read-aloud text, private notes, NPCs, loot and exits. The graph shows how scenes connect and flags scenes the party cannot reach.
- **NPC and loot cards:** write them once, give NPCs a voice note for how to play them and place them in any number of scenes.
- **Review before you play:** dead ends, clues that are easy to miss, and encounters whose XP no longer fit the party (SRD 5.2 budget).
- **Create and adapt with an AI assistant:** the app copies instructions for an assistant such as Claude and imports its answer, in the language you choose. Duplicate an adventure for another party size or level, or add the characters once you know them, and have the adventure fitted to the party the same way.
- **Live mode:** the current scene with its exits as buttons, its NPCs, loot and encounters; jump to any scene or open the scene graph.
- **Battle maps:** the AI assistant sketches a grid map for every scene with a fight (walls, cover, difficult terrain, where everyone starts). Live mode shows it full screen so you can copy it onto a battle mat. You can also upload your own map images.
- **Session log:** scene changes are logged automatically, add notes in one line, export the log as Markdown.
- **Monster stat blocks:** all 331 monsters of the SRD 5.2.1 are built in. The AI assistant picks its creatures from them, and live mode and the initiative tracker show the full stat block with one click. Rules text stays in English.
- **Initiative tracker:** rounds and turns, hit points, SRD conditions; add an encounter's monsters or a scene's NPCs with one click. Monsters arrive with their hit points and their initiative score from the stat block. Player characters stay for the whole session.

Everything is stored in your browser (IndexedDB). Export your adventures to back them up.

## Repository layout

```
apps/
  dm/          Game master web app (laptop/tablet)
  player/      Player web app (phone)
packages/
  content/     Openly licensed game content: the SRD 5.2.1 monsters
  core/        Data model, validation and rules math (plain TypeScript, no UI)
examples/      Example adventures written for this project
```

More packages (`mcp`, `server`) follow in later phases.

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
- **Rules content:** This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. The monster stat blocks in `packages/content` were converted from the SRD 5.2 data of the [Open5e](https://open5e.com) project, see [packages/content/LICENSE.md](packages/content/LICENSE.md).
- **Adventure-building advice** in the instructions for AI assistants: this work includes material taken from the [Lazy GM's Resource Document](https://slyflourish.com/lazy_gm_resource_document.html) by Michael E. Shea of SlyFlourish.com, available under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
- **Icons** from [Lucide](https://lucide.dev) under the ISC License, see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Much of the code is created with Claude.

Lorewarden is unofficial fan content and is not affiliated with, endorsed, sponsored or approved by Wizards of the Coast.
