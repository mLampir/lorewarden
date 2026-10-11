# Lorewarden MCP server

Lets an AI assistant that speaks the [Model Context Protocol](https://modelcontextprotocol.io), such as Claude Desktop, read and write Lorewarden adventures. You talk to the assistant as usual, for example with your Claude subscription; the server makes sure every change is a valid Lorewarden adventure.

The server works directly on the adventures in the Lorewarden app when the app is open and connected; changes appear in the app right away, and the assistant sees the scene you are playing. Without the app it works on adventure files in one folder on your computer, by default `Lorewarden` in your home folder. Nothing leaves your computer except what the assistant itself sends to its provider.

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

   To use another folder for your adventures, add `"--dir", "/path/to/folder"` to `args`.

3. Restart Claude Desktop. Lorewarden appears under the tools of a new chat.

4. In the Lorewarden app open **Settings** and turn on **Connect to the Lorewarden MCP server**. The app remembers this. It shows "Connected" while Claude Desktop is running.

### How the app connects

The server listens on `127.0.0.1`, port 47615, and only accepts the app from pages on this computer (`localhost`). If you serve the app from another address, add `"--origin", "https://your-address"` to `args`; to use another port, add `"--port", "12345"` and enter the same port in the app's settings. When Claude Desktop quits, the server stops too.

While the app is connected, the tools work on the adventures in the app and the folder is not used.

## Update it

After `git pull`, run `pnpm install` and `pnpm build:mcp` again, then quit and restart Claude Desktop so it starts the new server, and reload the Lorewarden app. The configuration stays as it is.

## Use it

- **Build a new adventure:** choose the prompt **New adventure** from the Lorewarden entry in the chat's "+" menu, enter party size and level and, if you like, an idea. Claude works through it with you step by step: questions, three pitches, outline, scenes, details, encounters and a final check, and saves each step. Put everything you already have in mind into the idea, or write or attach it in the chat: a plot, places, NPCs, monsters. Claude keeps it, fills only the gaps and skips steps you have already settled. Without a language, the prompt uses the languages from the app's settings, including English rules terms if you chose them.
- **Work on an existing adventure:** ask Claude, e.g. "Make the cellar in my marsh adventure creepier" or "Add a second way into the tower".
- **At the table:** in live mode, the prompt **What now?** gives you three ways to react when the players do something unexpected. Tell it what happened; Claude looks up the scene you are in, its NPCs, the session log and the running combat with `get_table_state`.

Without the app connected, export an adventure into the folder to work on it, and import the file into the app afterwards (Library → Import). If the adventure is already there, the app asks before it replaces it.

## Tools

| Tool | What it does |
|---|---|
| `list_adventures`, `get_adventure` | Read the adventures in the folder (image data is left out) |
| `create_adventure`, `update_adventure` | Create an adventure; change title, summary, party, language or start scene |
| `upsert_scene`, `link_scenes` | Add or change scenes and connect them with exits |
| `upsert_npc`, `upsert_item`, `upsert_clue` | NPCs, items and clues, and the scenes they appear in |
| `search_monsters`, `get_monster` | Find SRD 5.2.1 monsters by name, type, size and challenge rating, including ones that fit the party or can stand in for a creature of the story, and read their stat blocks |
| `upsert_pool_monster`, `upsert_encounter` | Creatures, with an SRD monster as stand-in where possible, and the fights built from them |
| `remove_entry` | Remove an entry and every reference to it |
| `rate_encounter` | Difficulty of a group of monsters for the party, by the SRD 5.2 XP budget |
| `check_adventure` | Broken references, unreachable scenes, dead ends, clues found in only one place, unfitting encounters |
| `get_table_state` | The scene the party is in, recent log entries and the running combat (only with the app connected) |

Every change is validated before it is written; a change that would break the adventure is rejected and the file stays as it was.
