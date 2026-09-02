import { ItemView, MarkdownRenderer, TFolder, moment, setIcon } from "obsidian";
import type { TFile, WorkspaceLeaf, ViewStateResult } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import { renderIconValue } from "./pickers";

export const VIEW_TYPE_STATS = "para-folder-stats";

interface StatsViewState {
  folderPath?: string;
  name?: string;
  icon?: string;
}

interface FileMetrics {
  words: number;
  tasksOpen: number;
  tasksDone: number;
}

interface FolderStats {
  noteCount: number;
  subfolderCount: number;
  totalWords: number;
  totalBytes: number;
  tasksOpen: number;
  tasksDone: number;
  tags: [string, number][];
  recent: { file: TFile; words: number }[];
}


export class StatsView extends ItemView {
  private readonly plugin: ParaNavigatorPlugin;
  private state: StatsViewState = {};

  constructor(leaf: WorkspaceLeaf, plugin: ParaNavigatorPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_STATS;
  }

  getDisplayText(): string {
    return this.state.name ? `${this.state.name} dashboard` : "Folder statistics";
  }

  getIcon(): string {
    return "chart-column";
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  async setState(state: StatsViewState, result: ViewStateResult): Promise<void> {
    this.state = state ?? {};
    await this.refresh();
    result.history = false;
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("para-stats");

    const { folderPath, name, icon } = this.state;
    if (!folderPath) {
      container.createDiv({ cls: "para-stats-empty", text: "Open statistics from the PARA navigator." });
      return;
    }

    const abstract = this.app.vault.getAbstractFileByPath(folderPath);
    const folderConfig = this.plugin.settings.folders.find((entry) => entry.path === folderPath);
    if (!(abstract instanceof TFolder)) {
      const empty = container.createDiv("para-stats-empty");
      empty.createEl("p", {
        text: `"${name ?? folderPath}" is not mapped to an existing folder yet.`,
      });
      empty.createEl("p", {
        cls: "para-stats-hint",
        text: "Create the standard folder, or map this category to an existing folder in settings.",
      });
      const actions = empty.createDiv("para-stats-empty-actions");
      const createButton = actions.createEl("button", { text: `Create folder "${folderPath}"` });
      createButton.addEventListener("click", () => {
        void this.app.vault.createFolder(folderPath).then(() => this.refresh());
      });
      const detectButton = actions.createEl("button", { text: "Re-detect folders" });
      detectButton.addEventListener("click", () => {
        void this.plugin.redetectFolders().then(() => this.refresh());
      });
      return;
    }

    const stats = await this.collectStats(folderPath);

    const header = container.createDiv("para-stats-header");
    const iconEl = header.createSpan("para-stats-icon");
    renderIconValue(iconEl, icon ?? "folder");
    header.createEl("h2", { text: name ?? folderPath });
    const refreshIcon = header.createSpan("para-stats-refresh");
    refreshIcon.setAttr("role", "button");
    refreshIcon.setAttr("tabindex", "0");
    refreshIcon.setAttr("aria-label", "Refresh statistics");
    setIcon(refreshIcon, "refresh-cw");
    refreshIcon.addEventListener("click", () => void this.refresh());
    refreshIcon.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        void this.refresh();
      }
    });

    header.createDiv({ cls: "para-stats-path", text: folderPath });

    const cards = container.createDiv("para-stats-cards");
    this.renderCard(cards, "file-text", "Notes", String(stats.noteCount));
    this.renderCard(cards, "folder", "Subfolders", String(stats.subfolderCount));
    this.renderCard(cards, "whole-word", "Words", stats.totalWords.toLocaleString());
    this.renderCard(cards, "hard-drive", "Size", this.formatBytes(stats.totalBytes));
    this.renderCard(
      cards,
      "list-todo",
      "Tasks",
      stats.tasksOpen + stats.tasksDone > 0
        ? `${stats.tasksDone} / ${stats.tasksOpen + stats.tasksDone} done`
        : "None"
    );

    if (stats.tags.length > 0) {
      const tagSection = container.createDiv("para-stats-section");
      tagSection.createEl("h3", { text: "Top tags" });
      const tagList = tagSection.createDiv("para-stats-tags");
      for (const [tag, count] of stats.tags) {
        const chip = tagList.createSpan("para-stats-tag");
        chip.createSpan({ text: `#${tag}` });
        chip.createSpan({ cls: "para-stats-tag-count", text: String(count) });
      }
    }

    const recentSection = container.createDiv("para-stats-section");
    recentSection.createEl("h3", { text: "Recently modified" });
    if (stats.recent.length === 0) {
      recentSection.createDiv({ cls: "para-stats-empty", text: "No notes in this folder yet." });
    } else {
      const table = recentSection.createEl("table", { cls: "para-stats-table" });
      const headRow = table.createEl("thead").createEl("tr");
      for (const label of ["Note", "Modified", "Words"]) {
        headRow.createEl("th", { text: label });
      }
      const tbody = table.createEl("tbody");
      for (const { file, words } of stats.recent) {
        const row = tbody.createEl("tr");
        const nameCell = row.createEl("td");
        const link = nameCell.createEl("a", { text: file.basename, cls: "internal-link" });
        link.setAttr("aria-label", `Open ${file.basename}`);
        link.addEventListener("click", () => void this.app.workspace.getLeaf("tab").openFile(file));
        row.createEl("td", { text: moment(file.stat.mtime).format("YYYY-MM-DD HH:mm") });
        row.createEl("td", { text: String(words) });
      }
    }
    if (folderConfig) {
      const tableSection = container.createDiv("para-stats-section");
      tableSection.createEl("h3", { text: "Table" });
      const baseContainer = tableSection.createDiv("para-stats-base");
      const baseFile = await this.plugin.ensureBaseFile(folderConfig);
      await MarkdownRenderer.render(this.app, `![[${baseFile.path}]]`, baseContainer, baseFile.path, this);
    }
  }

  private renderCard(parent: HTMLElement, iconName: string, label: string, value: string): void {
    const card = parent.createDiv("para-stats-card");
    const icon = card.createSpan("para-stats-card-icon");
    setIcon(icon, iconName);
    card.createDiv({ cls: "para-stats-card-value", text: value });
    card.createDiv({ cls: "para-stats-card-label", text: label });
  }

  private async collectStats(folderPath: string): Promise<FolderStats> {
    const prefix = `${folderPath}/`;
    const files = this.app.vault.getFiles().filter((file) => file.path.startsWith(prefix));
    const subfolders = new Set<string>();
    const tagCounts: Record<string, number> = {};
    const metrics = new Map<string, FileMetrics>();

    let totalWords = 0;
    let totalBytes = 0;
    let tasksOpen = 0;
    let tasksDone = 0;

    for (const file of files) {
      totalBytes += file.stat.size;
      const relativeParent = file.parent?.path.slice(prefix.length) ?? "";
      if (relativeParent.includes("/")) {
        subfolders.add(relativeParent.split("/")[0]);
      } else if (relativeParent.length > 0) {
        subfolders.add(relativeParent);
      }

      const cache = this.app.metadataCache.getFileCache(file);
      for (const tag of cache?.tags ?? []) {
        const key = tag.tag.replace(/^#/, "");
        tagCounts[key] = (tagCounts[key] ?? 0) + 1;
      }

      const content = await this.app.vault.cachedRead(file);
      const words = content.split(/\s+/).filter((word) => word.length > 0).length;
      const open = (content.match(/^\s*[-*+] \[ \]/gm) ?? []).length;
      const done = (content.match(/^\s*[-*+] \[x\]/gim) ?? []).length;
      totalWords += words;
      tasksOpen += open;
      tasksDone += done;
      metrics.set(file.path, { words, tasksOpen: open, tasksDone: done });
    }

    const recent = files
      .slice()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 10)
      .map((file) => ({ file, words: metrics.get(file.path)?.words ?? 0 }));

    const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      noteCount: files.length,
      subfolderCount: subfolders.size,
      totalWords,
      totalBytes,
      tasksOpen,
      tasksDone,
      tags,
      recent,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
