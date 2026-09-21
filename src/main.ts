import { Plugin, MarkdownView, Notice, TFile, TFolder } from "obsidian";
import { NavigatorView, VIEW_TYPE_NAVIGATOR } from "./navigator-view";
import { StatsView, VIEW_TYPE_STATS } from "./stats-view";
import { ParaNavigatorSettingTab } from "./settings-tab";
import { baseFileContent } from "./bases";
import { detectParaPaths } from "./para-detect";
import { DEFAULT_SETTINGS } from "./settings";
import type { ParaFolderConfig, ParaNavigatorSettings } from "./settings";

export default class ParaNavigatorPlugin extends Plugin {
  settings!: ParaNavigatorSettings;
  private prevNewFileLocation: unknown = null;
  private prevNewFileFolderPath: unknown = null;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as Partial<ParaNavigatorSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});

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

    this.setInboxAsNewFileLocation();
  }

  onunload(): void {
    if (this.prevNewFileLocation !== null) {
      this.app.vault.setConfig("newFileLocation", this.prevNewFileLocation);
      this.app.vault.setConfig("newFileFolderPath", this.prevNewFileFolderPath);
    }
  }

  /** Native "create new note" lands in the Inbox instead of the vault root. */
  private setInboxAsNewFileLocation(): void {
    const inbox = this.settings.folders.find((folder) => folder.id === "inbox");
    if (!inbox) return;
    if (!(this.app.vault.getAbstractFileByPath(inbox.path) instanceof TFolder)) return;
    this.prevNewFileLocation = this.app.vault.getConfig("newFileLocation");
    this.prevNewFileFolderPath = this.app.vault.getConfig("newFileFolderPath");
    this.app.vault.setConfig("newFileLocation", "folder");
    this.app.vault.setConfig("newFileFolderPath", inbox.path);
  }

  /** Focuses the tab already showing `file` when one exists; otherwise opens a new tab. */
  openFileReusingTab(file: TFile): void {
    const existing = this.app.workspace
      .getLeavesOfType("markdown")
      .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
    if (existing) {
      void this.app.workspace.revealLeaf(existing);
      // revealLeaf alone does not reliably activate already-visible leaves.
      this.app.workspace.setActiveLeaf(existing, { focus: true });
    } else {
      void this.app.workspace.getLeaf("tab").openFile(file);
    }
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
   * Creates a single note directly inside basePath. ".md" is appended when
   * missing. Returns the file, or null when the name is invalid or taken.
   */
  async createNote(basePath: string, name: string): Promise<TFile | null> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.includes("/") || trimmed === "." || trimmed === "..") {
      new Notice("Invalid name.");
      return null;
    }
    const fileName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
    const path = `${basePath}/${fileName}`;
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Already exists: ${path}`);
      return null;
    }
    return this.app.vault.create(path, "");
  }
  /** Returns the folder note for a folder (`X/X.md`), creating it empty if missing. */
  async ensureFolderNote(folder: TFolder): Promise<TFile> {
    const path = `${folder.path}/${folder.name}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    return this.app.vault.create(path, "");
  }

  /**
   * Converts a leaf note `P/X.md` into a folder note `P/X/X.md` so it can
   * have children. Links vault-wide are updated by renameFile.
   * Returns the new folder, or null when conversion is impossible.
   */
  async convertLeafToFolderNote(file: TFile): Promise<TFolder | null> {
    if (file.extension !== "md") return null;
    const folderPath = file.path.slice(0, -".md".length);
    const targetNotePath = `${folderPath}/${file.name}`;
    if (this.app.vault.getAbstractFileByPath(targetNotePath)) {
      new Notice(`Cannot convert: ${targetNotePath} already exists.`);
      return null;
    }
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof TFile) {
      new Notice(`Cannot convert: ${folderPath} is blocked by a file.`);
      return null;
    }
    if (!existing) {
      await this.app.vault.createFolder(folderPath);
    }
    await this.app.fileManager.renameFile(file, targetNotePath);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    return folder instanceof TFolder ? folder : null;
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
    await workspace.revealLeaf(leaf);
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
    // Focus the existing dashboard tab for this folder instead of duplicating it.
    const existing = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_STATS)
      .find((leaf) => leaf.getViewState().state?.folderPath === folder.path);
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    // Unmapped folders are allowed through — the dashboard shows guidance
    // and a user-initiated "create folder" action instead of dead-ends.
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_STATS,
      active: true,
      state: { folderPath: folder.path, name: folder.name, icon: folder.icon },
    });
    await this.app.workspace.revealLeaf(leaf);
  }
}
