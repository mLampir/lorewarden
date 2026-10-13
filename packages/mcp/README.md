# Lorewarden MCP server

Lets an AI assistant that speaks the [Model Context Protocol](https://modelcontextprotocol.io), such as Claude Desktop, read and write Lorewarden adventures. You talk to the assistant as usual, for example with your Claude subscription; the server makes sure every change is a valid Lorewarden adventure.

The MCP server talks to the Lorewarden server on your computer (`pnpm start`), so the assistant works on the same adventures as the app: changes appear in the open app right away, and the assistant sees the scene you are playing. A change is saved only on top of the newest version: if the game master saved the adventure after the assistant read it, the change is applied again to the newer version, so neither side is lost. While Lorewarden is not running, it works on the adventure files directly, in the folder `Lorewarden` in your home folder. Nothing leaves your computer except what the assistant itself sends to its provider.

## Set up Claude Desktop

1. Build the server once (Node.js 22 or newer):

   ```sh
   pnpm install
   pnpm build:mcp
   ```

2. In Claude Desktop open **Settings → Developer → Edit Config** and add Lorewarden to `claude_desktop_config.json`. Use the full path to your copy of this repository:

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

3. Restart Claude Desktop. Lorewarden appears under the tools of a new chat.

### Options

| Option | Meaning |
|---|---|
| `"--dir", "/path/to/folder"` | The folder used while Lorewarden is not running. Use the same folder you start Lorewarden with. |
| `"--server", "http://host:port"` | Address of the Lorewarden server, by default `http://127.0.0.1:47616`. With another address, the tools only use the folder if you also give `--dir`. |
| `"--token", "..."` | Lets the MCP server in when Lorewarden has a password. On the same computer it reads the token from the adventure folder on its own; for a hosted Lorewarden see [Hosting Lorewarden yourself](../../docs/self-hosting.md#ai-assistants), which also explains how to connect Claude to a hosted Lorewarden without this program. |

The environment variables `LOREWARDEN_SERVER`, `LOREWARDEN_TOKEN`, `LOREWARDEN_PORT` and `LOREWARDEN_DIR` do the same. Without a password, the Lorewarden server only lets programs on its own computer read and change adventures.

## Update it

After `git pull`, run `pnpm install` and `pnpm build:mcp` again, then quit and restart Claude Desktop so it starts the new server, and restart Lorewarden. The configuration stays as it is.

## Use it

- **Build a new adventure:** choose the prompt **New adventure** from the Lorewarden entry in the chat's "+" menu, enter the name of your party or party size and level and, if you like, an idea. Claude works through it with you step by step: questions, three pitches, outline, scenes, details, encounters, a final check and a review through the eyes of your players, and saves each step. Put everything you already have in mind into the idea, or write or attach it in the chat: a plot, places, NPCs, monsters. Claude keeps it, fills only the gaps and skips steps you have already settled. Without a language, the prompt uses the languages from the app's settings, including English rules terms if you chose them.
- **Fit an adventure to your party:** choose the prompt **Adapt an adventure** and enter the adventure's title and the name of your party, or party size and level. Without a saved party, add a line for each character once you know them (class, background, what their player enjoys). You can also just ask, e.g. "fit the Lantern in the Marsh to my Tuesday group". Claude rates the encounters, lists what it would change and waits for your answer, then saves the changes one by one: encounters, creatures and rewards that suit the party and, with characters, a start scene that gives each of them a reason to be there, a moment for each character and ties to their backgrounds. The plot, the scenes and how they connect stay as they are.
- **Work on an existing adventure:** ask Claude, e.g. "Make the cellar in my marsh adventure creepier" or "Add a second way into the tower".
- **At the table:** in live mode, the prompt **What now?** gives you three ways to react when the players do something unexpected. Tell it what happened; Claude looks up the scene you are in, its NPCs, the clues the party still misses, the session log and the running combat with `get_table_state`, and can suggest placing a missing clue or bringing in an NPC from elsewhere.

Adventures that Claude saves while Lorewarden is not running are in the library the next time you start it.

## Prompt fields

| Prompt | Field | Meaning |
|---|---|---|
| New adventure | idea | Everything you already have in mind, as long as you like: plot, places, NPCs, monsters. Empty for a surprise. |
| | party | Name of one of your parties. Claude gets its characters, writes for them and links the adventure to the party |
| | partySize, partyLevel | Number and level of the characters. Empty: those of the party, otherwise 4 and 1 |
| | length | `one-shot` (default), `two-evenings` or your own words, e.g. `three evenings` or `a few evenings`. The scenes and fights scale with the number of evenings |
| | language | Language of the adventure text, e.g. `de`. Empty: the app's setting, otherwise the language you write in |
| | rulesTerms | `en` for rules terms such as DC, conditions and monster names as in the English rulebooks, `same` for the language of the text. Empty: the app's setting, otherwise `en` |
| Adapt an adventure | adventure | Title or id of the adventure |
| | party | Name of one of your parties. Claude gets its characters and links the adventure to the party |
| | partySize, partyLevel | The new party; empty keeps what the adventure says |
| | characters | Your notes on the characters, e.g. one line each with class, background and what their player enjoys. Empty: the notes saved in the adventure |
| What now? | situation | What just happened at the table |
| | scene, adventure | Only needed while Lorewarden is not running |

## Tools

| Tool | What it does |
|---|---|
| `list_adventures`, `get_adventure` | Read the adventures (image data is left out) |
| `create_adventure`, `update_adventure` | Create an adventure; change title, summary, party, language or start scene, or link it to one of your parties |
| `list_parties` | Your parties with their player characters, your notes on them and what the players wrote when they entered them |
| `upsert_scene`, `link_scenes` | Add or change scenes and connect them with exits |
| `upsert_npc`, `upsert_item`, `upsert_clue` | NPCs, items and clues, and the scenes they appear in; clues with ways to find them, each tied to a scene or an NPC |
| `upsert_puzzle` | Riddles and other puzzles with solution, hints and an optional SVG drawing for the players' phones |
| `search_monsters`, `get_monster` | Find SRD 5.2.1 monsters and the game master's own monsters by name, type, size and challenge rating, including ones that fit the party or can stand in for a creature of the story, and read their stat blocks |
| `upsert_monster` | Write the full stat block of an invented creature, into an adventure or into the game master's own monsters |
| `upsert_pool_monster`, `upsert_encounter` | Creatures, each based on a stat block, and the fights built from them, with named individual monsters, mechanics for boss fights and destructible objects |
| `remove_entry` | Remove an entry and every reference to it |
| `suggest_encounter` | Monsters for a fight of a given difficulty for the party, optionally of one creature type |
| `rate_encounter` | Difficulty of a group of monsters for the party, by the SRD 5.2 XP budget |
| `check_adventure` | Broken references, unreachable scenes, dead ends, clues found in only one place or without ways to find them, puzzles without solution or hints, unfitting encounters, boss fights without mechanics |
| `get_table_state` | The scene the party is in, the clues still open in other scenes with their ways to find them, all NPCs in short form, recent log entries and the running combat (only while Lorewarden is running) |

Every change is validated before it is written; a change that would break the adventure is rejected and the adventure stays as it was.

The upsert tools change only the fields they are given. Optional links and fields can be cleared with `null`: an NPC's `poolMonsterId` or `role`, an item's `rarity`, the `sceneId` of a puzzle or encounter, a scene's `battleMap` and a pool monster's `baseMonsterRef`. A pool monster's `overrides` change one by one, and `null` clears one of them. A new `baseMonsterRef` brings the challenge rating of its stat block along, and its name unless the creature has a name of its own.
