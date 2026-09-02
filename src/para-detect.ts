import { App, TFolder } from "obsidian";
import type { ParaNavigatorSettings } from "./settings";

/**
 * Candidate patterns per PARA category. Matched case-insensitively against
 * top-level folder names, tolerating numeric prefixes like "0-Inbox" or "1-Projects".
 */
const PATTERNS: Record<string, RegExp> = {
  inbox: /^(\d+[\s\-_.]*)?(inbox|收集箱|收件箱|闪念)$/i,
  projects: /^(\d+[\s\-_.]*)?(projects?|项目)$/i,
  areas: /^(\d+[\s\-_.]*)?(areas?|领域|职责)$/i,
  resources: /^(\d+[\s\-_.]*)?(resources?|资源|资料)$/i,
  archives: /^(\d+[\s\-_.]*)?(archives?|归档|存档)$/i,
};

/**
 * Resolves each PARA category to an existing top-level folder.
 * Read-only: never creates, renames, or deletes anything in the vault.
 * Returns true when at least one path changed (caller persists settings).
 */
export function detectParaPaths(app: App, settings: ParaNavigatorSettings): boolean {
  const root = app.vault.getRoot();
  const topFolders = root.children.filter((child): child is TFolder => child instanceof TFolder);
  let changed = false;

  for (const folder of settings.folders) {
    const current = app.vault.getAbstractFileByPath(folder.path);
    if (current instanceof TFolder) continue;

    const pattern = PATTERNS[folder.id];
    if (!pattern) continue;
    const match = topFolders.find((candidate) => pattern.test(candidate.name));
    if (match && match.path !== folder.path) {
      folder.path = match.path;
      changed = true;
    }
  }

  return changed;
}
