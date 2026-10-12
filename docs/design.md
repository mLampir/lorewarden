# Design guidelines

How Lorewarden looks and behaves, so new screens fit in. The shared styles live in
`apps/dm/src/styles.css`; the player app (`apps/player/src/App.vue`) mirrors its tokens.

## Principles

1. **At the table, the game master has seconds.** The important things in a scene must stand out
   at a glance: what to read aloud, what is secret, who is here, where it goes next. Order content
   by how often it is needed, not by how it is stored.
2. **As little handwork as possible.** Prefer a sensible default or an automatic step over an extra
   field or confirmation. Ask only before something that cannot be undone.
3. **One primary action per view.** It gets the `primary` button; everything else is quieter.
4. **Show, then explain.** Short labels and empty states that say what to do next instead of
   paragraphs of explanation above every section.
5. **Works for newcomers and experts alike.** Clear names, no jargon in the interface, and
   shortcuts (e.g. one-click "Add to initiative") that experienced game masters appreciate.

## Colours

Use the tokens, never raw colour values. Every token has a dark-mode value.

| Token | Use |
| --- | --- |
| `--bg`, `--surface`, `--surface-2`, `--surface-3` | Page background, cards, quiet fills (pills, hover) |
| `--text`, `--muted` | Body text, secondary text |
| `--border`, `--border-strong` | Card borders, input and button borders |
| `--accent`, `--accent-hover`, `--accent-soft` | Primary actions, active states, icons in headings, selected items |
| `--secret`, `--secret-soft` | Everything only the game master may see |
| `--danger`, `--danger-soft` | Deleting and destructive actions, monsters in initiative |
| `--ok` | Online, solved, player characters |
| `--focus` | Focus rings and "new" highlights |

Text read aloud to players has the accent border (`.read-aloud`); secret notes use the secret
colour (`.secret` for text, `.secret-input` for text fields). Keep that pairing everywhere.

## Typography

- Inter (bundled, works offline) for the interface; a book face (Georgia) only for text that is
  read aloud or shown to players.
- `h1` page title, `h2` card or dialog title, `h3` sub-heading. Parts of a page such as "Clues"
  or "Exits" use `.section-title`: small caps with an icon and an optional `.count`.
- Labels above fields (`.field > span`), short hints in `.hint`.

## Components

| Need | Use |
| --- | --- |
| Main action of a view | `<button class="primary">` |
| Normal action | `<button>` |
| Low-key action (toolbar, close, remove) | `<button class="ghost">`, with `.icon-only` for icon buttons |
| Destructive action | `<button class="danger">`, always with a confirmation |
| Small buttons inside lists and cards | add `.small` |
| A group of fields in a form | `<fieldset>` with `<legend>` and an icon; no nested frames |
| Toggle membership (NPC in scene, recipient) | `<label class="chip"><input type="checkbox"> …</label>` |
| Content that would push the page down (QR code, create forms) | `<dialog class="modal">` with `.modal-header` |
| List next to details | `.master-detail` with `.list` and `button.entry[aria-current]` |
| Page head | `<header class="page-header">`, a `.back` link above the title when it is a sub-page |
| Box of related content | `.card` |

Write new shared patterns into `styles.css` instead of copying scoped styles between components.

## Icons

Icons come from Lucide through `@lucide/vue`. Put an icon before the label on buttons that start
something (Play, Add, Import, Export) and before every `legend` and `.section-title`. Icon-only
buttons need a `title` and an `aria-label`. Decorative icons get `aria-hidden="true"`. Keep one
icon per meaning, e.g. `Swords` for encounters and combat, `Search` for clues, `Users` for NPCs,
`Gem` for loot, `DoorOpen` for exits, `Puzzle` for puzzles, `Map` for scenes and maps.

## Layout

- Pages are centred with `.page` (max 76rem); live mode is wider.
- Side columns that hold tools (initiative, monster list) are sticky below the top bar and scroll
  on their own, so they never disappear while reading.
- When a side column holds several tools, show one at a time with `.tabs` instead of stacking
  them, so what is needed together (scene text and an NPC) stays side by side. Hidden panels stay
  mounted so they keep their state.
- Every view must work at 390 px width: columns stack, the navigation shows only icons, nothing
  scrolls sideways except tab bars.

## Text and language

- All interface text goes through vue-i18n with English and German strings.
- Short, plain sentences; address the game master as "you" ("du" in German).
- Buttons say what happens ("Add to initiative"), not "OK" or "Submit".
- Empty states say what is missing and how to add it.

## Accessibility

- Every input has a label (visible, or `aria-label` when the context makes it obvious).
- Do not rely on colour alone: pair it with an icon, text or a pattern.
- Keep the visible focus ring; do not remove outlines.
- Check both light and dark mode before finishing a change.

## Checklist for a new screen or feature

- [ ] Uses tokens and the shared components above, no new colours or one-off button styles
- [ ] One primary action; destructive actions are quiet and confirmed
- [ ] Read-aloud and secret content use their colours
- [ ] Headings with icons, labels on all inputs
- [ ] Looks right at 390 px and in dark mode
- [ ] English and German strings
