import { Plugin, Notice, TFile, TFolder } from "obsidian";
import { NavigatorView, VIEW_TYPE_NAVIGATOR } from "./navigator-view";
import { StatsView, VIEW_TYPE_STATS } from "./stats-view";
import { ParaNavigatorSettingTab } from "./settings-tab";
import { baseFileContent } from "./bases";
import { detectParaPaths } from "./para-detect";
import { DEFAULT_SETTINGS } from "./settings";
import type { ParaFolderConfig, ParaNavigatorSettings } from "./settings";
export type CreateKind = "folder" | "note";

export default class ParaNavigatorPlugin extends Plugin {
  settings!: ParaNavigatorSettings;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Resolve categories to whatever the vault actually uses ("Inbox", "0-Inbox", …).
    // Read-only: detection never creates, renames, or deletes vault content.
    if (detectParaPaths(this.app, this.settings)) {
      await this.saveData(this.settings);
    }

    this.registerView(VIEW_TYPE_NAVIGATOR, (leaf) => new NavigatorView(leaf, this));
    this.registerView(VIEW_TYPE_STATS, (leaf) => new StatsView(leaf, this));

    this.addRibbonIcon("compass", "Open PARA navigator", () => void this.activateNavigator());

    this.addCommand({
      id: "open-navigator",
      name: "Open navigator",
      callback: () => void this.activateNavigator(),
    });

    for (const folder of this.settings.folders) {
      this.addCommand({
        id: `open-dashboard-${folder.id}`,
        name: `Open ${folder.name.toLowerCase()} dashboard`,
        callback: () => void this.openFolderDashboard(folder),
      });
    }

    this.addSettingTab(new ParaNavigatorSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
  async redetectFolders(): Promise<void> {
    if (detectParaPaths(this.app, this.settings)) {
      await this.saveData(this.settings);
    }
  }
  /**
   * Creates every configured PARA folder that does not exist yet.
   * Only ever runs from explicit user action (onboarding button).
   * Returns the number of folders created.
   */
  async createMissingParaFolders(): Promise<number> {
    let created = 0;
    for (const folder of this.settings.folders) {
      if (!this.app.vault.getAbstractFileByPath(folder.path)) {
        await this.app.vault.createFolder(folder.path);
        created++;
      }
    }
    return created;
  }
  /**
   * Creates a folder chain or a note under basePath from a slash-separated
   * relative path ("area/topic/sub"). Notes get ".md" appended when missing.
   * Returns the created path, or null when the path is invalid or taken.
   */
  async createEntry(basePath: string, relativePath: string, kind: CreateKind): Promise<string | null> {
    const segments = relativePath
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
      new Notice("Invalid path.");
      return null;
    }
    if (kind === "note" && !segments[segments.length - 1].toLowerCase().endsWith(".md")) {
      segments[segments.length - 1] = `${segments[segments.length - 1]}.md`;
    }

    let current = basePath;
    for (let index = 0; index < segments.length; index++) {
      current = `${current}/${segments[index]}`;
      const isLast = index === segments.length - 1;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing) {
        if (isLast) {
          new Notice(`Already exists: ${current}`);
          return null;
        }
        if (existing instanceof TFile) {
          new Notice(`A file blocks this path: ${current}`);
          return null;
        }
        continue;
      }
      if (isLast && kind === "note") {
        await this.app.vault.create(current, "");
      } else {
        await this.app.vault.createFolder(current);
      }
    }
    return current;
  }

  async activateNavigator(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_NAVIGATOR)[0];
    if (!leaf) {
      const left = workspace.getLeftLeaf(false);
      if (!left) return;
      await left.setViewState({ type: VIEW_TYPE_NAVIGATOR, active: true });
      leaf = left;
    }
    workspace.revealLeaf(leaf);
  }

  /**
   * Returns the .base file scoped to the PARA folder, creating it on demand
   * the first time only. Existing files are never overwritten.
   */
  async ensureBaseFile(folder: ParaFolderConfig): Promise<TFile> {
    const baseDir = this.settings.baseFolder.trim() || "Dashboard";
    if (!this.app.vault.getAbstractFileByPath(baseDir)) {
      await this.app.vault.createFolder(baseDir);
    }

    const basePath = `${baseDir}/${folder.name}.base`;
    const existing = this.app.vault.getAbstractFileByPath(basePath);
    return existing instanceof TFile ? existing : this.app.vault.create(basePath, baseFileContent(folder));
  }

  async openFolderDashboard(folder: ParaFolderConfig): Promise<void> {
    // Unmapped folders are allowed through — the dashboard shows guidance
    // and a user-initiated "create folder" action instead of dead-ends.
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_STATS,
      active: true,
      state: { folderPath: folder.path, name: folder.name, icon: folder.icon },
    });
    this.app.workspace.revealLeaf(leaf);
  }
}
