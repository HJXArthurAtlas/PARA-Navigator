import type { ParaFolderConfig } from "./settings";

/**
 * Generates the YAML content for a `.base` file scoped to one PARA folder.
 * Only written when the file does not exist yet — user edits are never clobbered.
 */
export function baseFileContent(folder: ParaFolderConfig): string {
  return [
    "filters:",
    "  and:",
    `    - file.inFolder("${folder.path}")`,
    `    - 'file.ext == "md"'`,
    "",
    "views:",
    "  - type: table",
    '    name: "All notes"',
    "    order:",
    "      - file.name",
    "      - file.ctime",
    "      - file.mtime",
    "      - file.tags",
    "      - file.size",
    "",
    "  - type: cards",
    '    name: "Cards"',
    "    order:",
    "      - file.name",
    "      - file.mtime",
    "",
  ].join("\n");
}
