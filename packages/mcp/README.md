# Lorewarden MCP server

Lets an AI assistant that speaks the [Model Context Protocol](https://modelcontextprotocol.io), such as Claude Desktop, read and write Lorewarden adventures. You talk to the assistant as usual, for example with your Claude subscription; the server makes sure every change is a valid Lorewarden adventure.

The MCP server talks to the Lorewarden server on your computer (`pnpm start`), so the assistant works on the same adventures as the app: changes appear in the open app right away, and the assistant sees the scene you are playing. While Lorewarden is not running, it works on the adventure files directly, in the folder `Lorewarden` in your home folder. Nothing leaves your computer except what the assistant itself sends to its provider.

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

- **Build a new adventure:** choose the prompt **New adventure** from the Lorewarden entry in the chat's "+" menu, enter party size and level and, if you like, an idea. Claude works through it with you step by step: questions, three pitches, outline, scenes, details, encounters and a final check, and saves each step. Put everything you already have in mind into the idea, or write or attach it in the chat: a plot, places, NPCs, monsters. Claude keeps it, fills only the gaps and skips steps you have already settled. Without a language, the prompt uses the languages from the app's settings, including English rules terms if you chose them.
- **Work on an existing adventure:** ask Claude, e.g. "Make the cellar in my marsh adventure creepier" or "Add a second way into the tower".
- **At the table:** in live mode, the prompt **What now?** gives you three ways to react when the players do something unexpected. Tell it what happened; Claude looks up the scene you are in, its NPCs, the session log and the running combat with `get_table_state`.

Adventures that Claude saves while Lorewarden is not running are in the library the next time you start it.

## Prompt fields

| Prompt | Field | Meaning |
|---|---|---|
| New adventure | idea | Everything you already have in mind, as long as you like: plot, places, NPCs, monsters. Empty for a surprise. |
| | partySize, partyLevel | Number and level of the characters |
| | length | `one-shot` (default) or `two-evenings` |
| | language | Language of the adventure text, e.g. `de`. Empty: the app's setting, otherwise the language you write in |
| | rulesTerms | `en` for rules terms such as DC, conditions and monster names as in the English rulebooks, `same` for the language of the text. Empty: the app's setting, otherwise `en` |
| What now? | situation | What just happened at the table |
| | scene, adventure | Only needed while Lorewarden is not running |

## Tools

| Tool | What it does |
|---|---|
| `list_adventures`, `get_adventure` | Read the adventures (image data is left out) |
| `create_adventure`, `update_adventure` | Create an adventure; change title, summary, party, language or start scene |
| `upsert_scene`, `link_scenes` | Add or change scenes and connect them with exits |
| `upsert_npc`, `upsert_item`, `upsert_clue` | NPCs, items and clues, and the scenes they appear in |
| `upsert_puzzle` | Riddles and other puzzles with solution, hints and an optional SVG drawing for the players' phones |
| `search_monsters`, `get_monster` | Find SRD 5.2.1 monsters and the game master's own monsters by name, type, size and challenge rating, including ones that fit the party or can stand in for a creature of the story, and read their stat blocks |
| `upsert_monster` | Write the full stat block of an invented creature, into an adventure or into the game master's own monsters |
| `upsert_pool_monster`, `upsert_encounter` | Creatures, each based on a stat block, and the fights built from them |
| `remove_entry` | Remove an entry and every reference to it |
| `suggest_encounter` | Monsters for a fight of a given difficulty for the party, optionally of one creature type |
| `rate_encounter` | Difficulty of a group of monsters for the party, by the SRD 5.2 XP budget |
| `check_adventure` | Broken references, unreachable scenes, dead ends, clues found in only one place, puzzles without solution or hints, unfitting encounters |
| `get_table_state` | The scene the party is in, recent log entries and the running combat (only while Lorewarden is running) |

Every change is validated before it is written; a change that would break the adventure is rejected and the adventure stays as it was.
