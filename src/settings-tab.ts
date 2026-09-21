import { PluginSettingTab } from "obsidian";
import { TFolder } from "obsidian";
import type { App, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import { detectParaPaths } from "./para-detect";

/** Matches declarative control keys of the form `folders.<id>.<field>`. */
const FOLDER_KEY = /^folders\.([^.]*)\.(path|icon)$/;

export class ParaNavigatorSettingTab extends PluginSettingTab {
  private readonly plugin: ParaNavigatorPlugin;

  constructor(app: App, plugin: ParaNavigatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Declarative mirror of display() for Obsidian's settings search (1.13+).
   * Keep in sync with display(); folder keys use `folders.<id>.<field>` and
   * are resolved by the getControlValue/setControlValue overrides below.
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    const topFolders = this.app.vault
      .getRoot()
      .children.filter((child): child is TFolder => child instanceof TFolder)
      .map((child) => child.path);

    return [
      {
        type: "group",
        heading: "PARA folders",
        items: this.plugin.settings.folders.flatMap(
          (folder): SettingGroupItem[] => {
            const pathOptions: Record<string, string> = {};
            for (const path of topFolders) pathOptions[path] = path;
            pathOptions[folder.path] = folder.path;
            return [
              {
                name: folder.name,
                desc: "Mapped vault folder.",
                control: {
                  type: "dropdown",
                  key: `folders.${folder.id}.path`,
                  options: pathOptions,
                },
              },
              {
                name: `${folder.name} icon`,
                desc: "Lucide icon name or emoji.",
                control: {
                  type: "text",
                  key: `folders.${folder.id}.icon`,
                  placeholder: "Icon",
                },
              },
            ];
          }
        ),
      },
      {
        name: "Re-detect folders",
        desc: "Scan top-level folders and match them to the five PARA categories. Read-only — nothing is created or renamed.",
        action: () => {
          if (detectParaPaths(this.app, this.plugin.settings)) {
            void this.plugin.saveSettings();
          }
          this.update();
        },
      },
      {
        name: "Base file folder",
        desc: "Folder where per-category .base files are written the first time you open a table. Existing files are never overwritten.",
        control: {
          type: "text",
          key: "baseFolder",
          placeholder: "Dashboard",
        },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const match = FOLDER_KEY.exec(key);
    if (match) {
      const folder = this.plugin.settings.folders.find((f) => f.id === match[1]);
      if (folder) return folder[match[2] as "path" | "icon"];
    }
    return super.getControlValue(key);
  }

  override setControlValue(key: string, value: unknown): void {
    if (key === "baseFolder") {
      this.plugin.settings.baseFolder =
        typeof value === "string" && value.trim() ? value.trim() : "Dashboard";
      void this.plugin.saveSettings();
      return;
    }
    const match = FOLDER_KEY.exec(key);
    if (match && typeof value === "string") {
      const folder = this.plugin.settings.folders.find((f) => f.id === match[1]);
      if (folder) {
        if (match[2] === "path") folder.path = value;
        else folder.icon = value.trim() || "folder";
        void this.plugin.saveSettings();
        return;
      }
    }
    void super.setControlValue(key, value);
  }
}
