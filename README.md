# Lorewarden

A local-first toolkit for game masters of 5e-compatible tabletop RPGs: prepare your story, find the right thing at the table in one or two clicks, and react to your players.

> **Status:** early development. The game master app can prepare and run an adventure, and an MCP server lets AI assistants such as Claude Desktop build and edit adventures (Phase 3, first part); everything else is still to come. See the [roadmap](#roadmap).

## Principles

- **Game master first.** The player side is an extra, never a requirement.
- **Fast at the table.** Everything in live mode is one or two clicks away.
- **Local-first.** Your adventures stay on your computer as JSON files. No account, no cloud.
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

The game master app (`pnpm start`, then open http://localhost:47616):

- **Adventure library:** create adventures, import and export them as JSON, load the example adventure.
- **Scene graph editor:** scenes with read-aloud text, private notes, NPCs, loot and exits. The graph shows how scenes connect and flags scenes the party cannot reach.
- **NPC and loot cards:** write them once, give NPCs a voice note for how to play them and place them in any number of scenes.
- **Review before you play:** dead ends, clues that are easy to miss, and encounters whose XP no longer fit the party (SRD 5.2 budget).
- **Create and adapt with an AI assistant:** the app copies instructions for an assistant such as Claude and imports its answer, in the language you choose. Duplicate an adventure for another party size or level, or add the characters once you know them, and have the adventure fitted to the party the same way.
- **Live mode:** the current scene with its exits as buttons, its NPCs, loot and encounters; jump to any scene or open the scene graph.
- **Battle maps:** the AI assistant sketches a grid map for every scene with a fight (walls, cover, difficult terrain, where everyone starts). Live mode shows it full screen so you can copy it onto a battle mat. You can also upload your own map images.
- **Session log:** scene changes are logged automatically, add notes in one line, export the log as Markdown.
- **Monster stat blocks:** all 331 monsters of the SRD 5.2.1 are built in. The AI assistant picks its creatures from them, and live mode and the initiative tracker show the full stat block with one click. Rules text stays in English.
- **Your own monsters:** create monsters with a full stat block, copy an SRD monster and change it, or let an AI assistant write one. They are kept next to the SRD monsters, every adventure can use them, and the AI assistant knows them. Creatures an AI invents for an adventure get a full stat block too; save them to your monsters with one click. An exported adventure carries the stat blocks it needs.
- **Players at the table:** players join with their phones by scanning a QR code; no app and no account needed. Show handouts, images, read-aloud text and hints to everyone or to single players, and take them back. Phones need to be in the same Wi-Fi as the game master's computer.
- **Initiative tracker:** rounds and turns, hit points, SRD conditions; add an encounter's monsters or a scene's NPCs with one click. Monsters arrive with their hit points and their initiative score from the stat block. Player characters stay for the whole session.

A small Lorewarden server runs on your computer. It keeps every adventure as a file in the folder `~/Lorewarden` (change it with `--dir` or `LOREWARDEN_DIR`) and your own monsters in `monsters.json` there, serves the game master app to this computer only, and passes on to the phones what you show your players. Back up the folder, or export single adventures to share them.

To run Lorewarden on a server with Docker, see [Hosting Lorewarden yourself](docs/self-hosting.md). The game master app shows when a new release is out.

## Work with an AI assistant (MCP server)

Lorewarden comes with an [MCP](https://modelcontextprotocol.io) server, so an AI assistant such as Claude Desktop can work on your adventures with you, using your own subscription:

- **Build an adventure:** the prompt "New adventure" works through a short adventure with you step by step and saves every step. Bring as much as you already have, such as a plot, NPCs or monsters that should appear; Claude builds on it and skips what you have settled.
- **Change an adventure:** "Make the cellar creepier", "Add a second way into the tower".
- **At the table:** the prompt "What now?" knows the scene you are playing, the session log and the running combat, and suggests three ways to react.
- **Monsters:** the assistant picks SRD monsters and your own monsters that fit your party, and writes a full stat block for a creature it invents, so you have every stat block at the table. Ask it to save a monster to your monsters, and every adventure can use it.

The assistant uses the same Lorewarden server as the app, so everything it changes appears in the app right away. Everything stays on your computer.

### Set it up

1. Get the code and build the server (Node.js 22 or newer):

   ```sh
   git clone https://github.com/mLampir/lorewarden.git
   cd lorewarden
   corepack enable
   pnpm install
   pnpm build:mcp
   ```

2. In Claude Desktop open **Settings → Developer → Edit Config** and add Lorewarden to `claude_desktop_config.json`, with the full path to your copy:

   ```json
   {
     "mcpServers": {
       "lorewarden": {
         "command": "node",
         "args": ["/path/to/lorewarden/packages/mcp/dist/lorewarden-mcp.js"]
       }
     }
   }
   ```

3. Restart Claude Desktop and start Lorewarden with `pnpm start`. The AI works on the same adventures as the app, and its changes show up in the open app right away. When Lorewarden is not running, it works on the adventure files directly.

### Update it

In your copy of the repository:

```sh
git pull
pnpm install
pnpm build:mcp
```

Then quit and restart Claude Desktop, so it starts the new MCP server, and restart Lorewarden. The configuration stays as it is.

More options, such as another folder, and the list of tools are in the [server's README](packages/mcp/README.md).

## Repository layout

```
apps/
  dm/          Game master web app (laptop/tablet)
  player/      Player web app (phone)
packages/
  content/     Openly licensed game content: the SRD 5.2.1 monsters
  core/        Data model, validation and rules math (plain TypeScript, no UI)
  mcp/         MCP server for AI assistants such as Claude Desktop
  server/      Lorewarden server: keeps adventures, serves both apps, talks to the phones
examples/      Example adventures written for this project
```

## Development

Requirements: Node.js 22 or newer and [pnpm](https://pnpm.io) (`corepack enable` installs the right version).

```sh
pnpm install
pnpm start        # build everything and run Lorewarden on http://localhost:47616
pnpm dev          # Lorewarden server (with a fresh player build) plus the game master app with hot reload on http://localhost:5173
pnpm dev:player   # player app with hot reload on http://localhost:5174/play/
pnpm test
pnpm lint
pnpm build
```

To show handouts on your players' phones, open live mode and press **Connect phones**. The phones scan the QR code and need to be in the same Wi-Fi. Your operating system may ask whether Node.js may accept connections; allow it for private networks.

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
