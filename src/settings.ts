export interface ParaFolderConfig {
  /** Stable category key: inbox | projects | areas | resources | archives */
  id: string;
  /** Display name shown in the navigator */
  name: string;
  /** Resolved vault path — auto-detected on load, editable in settings */
  path: string;
  /** Lucide icon name */
  icon: string;
}

export interface ParaNavigatorSettings {
  folders: ParaFolderConfig[];
  /** Vault folder where generated .base files are written (created on demand only) */
  baseFolder: string;
}

export const DEFAULT_SETTINGS: ParaNavigatorSettings = {
  folders: [
    { id: "inbox", name: "Inbox", path: "Inbox", icon: "inbox" },
    { id: "projects", name: "Projects", path: "Projects", icon: "rocket" },
    { id: "areas", name: "Areas", path: "Areas", icon: "layers" },
    { id: "resources", name: "Resources", path: "Resources", icon: "library" },
    { id: "archives", name: "Archives", path: "Archives", icon: "archive" },
  ],
  baseFolder: "Dashboard",
};
