# Lorewarden MCP server

Lets an AI assistant that speaks the [Model Context Protocol](https://modelcontextprotocol.io), such as Claude Desktop, read and write Lorewarden adventures. You talk to the assistant as usual, for example with your Claude subscription; the server makes sure every change is a valid Lorewarden adventure.

The server works on adventure files in one folder on your computer, by default `Lorewarden` in your home folder. Nothing leaves your computer except what the assistant itself sends to its provider.

## Set up Claude Desktop

1. Build the server once (Node.js 22 or newer):

   ```sh
   pnpm install
   pnpm --filter @lorewarden/mcp build
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

## Use it

- **Build a new adventure:** choose the prompt **New adventure** from the Lorewarden entry in the chat's "+" menu, enter party size and level and, if you like, an idea. Claude works through it with you step by step: questions, three pitches, outline, scenes, details, encounters and a final check, and saves each step.
- **Work on an existing adventure:** export it from the Lorewarden app into the folder, then ask Claude, e.g. "Make the cellar in my marsh adventure creepier" or "Add a second way into the tower".
- **At the table:** the prompt **What now?** gives you three ways to react when the players do something unexpected. Tell it what happened and, if you like, the scene the party is in; Claude reads the adventure and that scene first. The server cannot see the app, so it does not know the current scene by itself.

Then import the file in the Lorewarden app (Library → Import). If the adventure is already there, the app asks before it replaces it.

## Tools

| Tool | What it does |
|---|---|
| `list_adventures`, `get_adventure` | Read the adventures in the folder (image data is left out) |
| `create_adventure`, `update_adventure` | Create an adventure; change title, summary, party, language or start scene |
| `upsert_scene`, `link_scenes` | Add or change scenes and connect them with exits |
| `upsert_npc`, `upsert_item`, `upsert_clue` | NPCs, items and clues, and the scenes they appear in |
| `upsert_pool_monster`, `upsert_encounter` | Creatures and the fights built from them |
| `remove_entry` | Remove an entry and every reference to it |
| `rate_encounter` | Difficulty of a group of monsters for the party, by the SRD 5.2 XP budget |
| `check_adventure` | Broken references, unreachable scenes, dead ends, clues found in only one place, unfitting encounters |

Every change is validated before it is written; a change that would break the adventure is rejected and the file stays as it was.
