# PARA Navigator

A PARA-based sidebar navigator for Obsidian, with per-folder Bases tables and statistics dashboards.

PARA Navigator turns your PARA folder structure (Inbox / Projects / Areas / Resources / Archives) into a navigable note tree in the sidebar. Every node in the tree is a note: folders are represented by their folder note (`Projects/My Project/My Project.md`), so browsing and building hierarchy never leaves Markdown.

## Features

- **PARA sidebar tree** — Inbox, Projects, Areas, Resources and Archives in one panel. Top-level folders are auto-detected on load, tolerating numeric prefixes (`1-Projects`) and English/Chinese folder names; paths stay editable in settings.
- **Folder-note hierarchy** — create notes, folders and sub-trees inline. A folder's note (`X/X.md`) is its entry; children live inside the folder.
- **Leaf-to-folder conversion** — turn a leaf note `P/X.md` into a folder note `P/X/X.md` at any time; vault-wide links are updated automatically.
- **Inbox-first capture** — native "create new note" lands in Inbox instead of the vault root.
- **Drag-and-drop ordering** — per-folder custom child order, remembered across restarts.
- **Icons and colors** — pick a Lucide icon and a name color for any node.
- **Bases dashboards** — one-click per-folder `.base` table (generated on demand in a configurable folder, existing files are never overwritten).
- **Statistics dashboards** — note count, subfolders, word count, open/done tasks, top tags and recently edited notes for any PARA folder.
- **Tab reuse** — opening a file that is already open focuses its existing tab instead of duplicating it.

## Usage

1. Install and enable the plugin, then open the PARA Navigator from the ribbon icon or command palette (`PARA Navigator: Open navigator`).
2. If your top-level folders are not detected automatically, adjust the paths in `Settings → PARA Navigator`, or use **Redetect folders** / **Create missing folders**.
3. Right-click any node for actions: new note, new folder, delete (with confirmation), convert to folder note, icon/color pickers, and dashboard shortcuts.

## Installation

Once approved, install from Obsidian's community plugin list: `Settings → Community plugins → Browse`, search for "PARA Navigator".

## Development

```bash
bun install
bun run dev     # watch mode, syncs to your dev vault
bun run build   # type-check + production build of main.js
```

Releases are built with esbuild; a release contains `main.js`, `manifest.json` and `styles.css`.

## License

[MIT](LICENSE)
