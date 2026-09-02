import { PluginSettingTab, Setting } from "obsidian";
import { TFolder } from "obsidian";
import type { App } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import { detectParaPaths } from "./para-detect";

export class ParaNavigatorSettingTab extends PluginSettingTab {
  private readonly plugin: ParaNavigatorPlugin;

  constructor(app: App, plugin: ParaNavigatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("PARA folders").setHeading();

    for (const folder of this.plugin.settings.folders) {
      new Setting(containerEl)
        .setName(folder.name)
        .setDesc("Mapped folder and Lucide icon name.")
        .addDropdown((dropdown) => {
          const topFolders = this.app.vault
            .getRoot()
            .children.filter((child): child is TFolder => child instanceof TFolder)
            .map((child) => child.path);
          for (const path of new Set([...topFolders, folder.path])) {
            dropdown.addOption(path, path);
          }
          dropdown.setValue(folder.path).onChange(async (value) => {
            folder.path = value;
            await this.plugin.saveSettings();
          });
        })
        .addText((text) =>
          text
            .setPlaceholder("Icon")
            .setValue(folder.icon)
            .onChange(async (value) => {
              folder.icon = value.trim() || "folder";
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Re-detect folders")
      .setDesc("Scan top-level folders and match them to the five PARA categories. Read-only — nothing is created or renamed.")
      .addButton((button) =>
        button
          .setButtonText("Detect")
          .onClick(async () => {
            if (detectParaPaths(this.app, this.plugin.settings)) {
              await this.plugin.saveSettings();
            }
            this.display();
          })
      );

    new Setting(containerEl).setName("Tables").setHeading();

    new Setting(containerEl)
      .setName("Base file folder")
      .setDesc("Folder where per-category .base files are written the first time you open a table. Existing files are never overwritten.")
      .addText((text) =>
        text
          .setPlaceholder("Dashboard")
          .setValue(this.plugin.settings.baseFolder)
          .onChange(async (value) => {
            this.plugin.settings.baseFolder = value.trim() || "Dashboard";
            await this.plugin.saveSettings();
          })
      );
  }
}
