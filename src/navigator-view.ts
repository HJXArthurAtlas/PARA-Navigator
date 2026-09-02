import { ItemView, TFile, TFolder, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import type { ParaFolderConfig } from "./settings";

export const VIEW_TYPE_NAVIGATOR = "para-navigator";

export class NavigatorView extends ItemView {
  private readonly plugin: ParaNavigatorPlugin;
  private readonly collapsed = new Set<string>();
  /** Paths of expanded subfolders — survives full re-renders */
  private readonly expandedSubfolders = new Set<string>();

  constructor(leaf: WorkspaceLeaf, plugin: ParaNavigatorPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_NAVIGATOR;
  }

  getDisplayText(): string {
    return "PARA navigator";
  }

  getIcon(): string {
    return "compass";
  }

  async onOpen(): Promise<void> {
    this.render();
    const rerender = () => this.render();
    this.registerEvent(this.app.vault.on("create", rerender));
    this.registerEvent(this.app.vault.on("delete", rerender));
    this.registerEvent(this.app.vault.on("rename", rerender));
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("para-navigator");

    const folders = this.plugin.settings.folders;
    const allMissing = folders.every(
      (folder) => !(this.app.vault.getAbstractFileByPath(folder.path) instanceof TFolder)
    );
    if (allMissing) {
      container.appendChild(this.renderOnboarding());
    }

    for (const folder of folders) {
      container.appendChild(this.renderFolder(folder));
    }
  }

  private renderOnboarding(): HTMLElement {
    const box = createDiv("para-onboarding");
    box.createEl("p", { text: "No PARA folders found in this vault." });
    box.createEl("p", {
      cls: "para-onboarding-hint",
      text: "Create the standard five, or map categories to existing folders in settings.",
    });
    const createButton = box.createEl("button", { text: "Create PARA folders" });
    createButton.addEventListener("click", () => {
      void this.plugin.createMissingParaFolders();
    });
    const detectButton = box.createEl("button", { text: "Re-detect" });
    detectButton.addEventListener("click", () => {
      void this.plugin.redetectFolders().then(() => this.render());
    });
    return box;
  }

  private renderFolder(config: ParaFolderConfig): HTMLElement {
    const section = createDiv("para-folder");
    const abstract = this.app.vault.getAbstractFileByPath(config.path);
    const exists = abstract instanceof TFolder;
    const isExpanded = !this.collapsed.has(config.id);
    const prefix = `${config.path}/`;
    const noteCount = exists
      ? this.app.vault.getFiles().filter((file) => file.path.startsWith(prefix)).length
      : 0;

    const header = section.createDiv("para-folder-header");
    header.setAttr("role", "button");
    header.setAttr("tabindex", "0");
    header.setAttr("aria-expanded", String(isExpanded));
    header.setAttr(
      "aria-label",
      exists ? `${config.name}, ${noteCount} notes` : `${config.name} — folder not found`
    );

    const chevron = header.createSpan("para-chevron");
    setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");

    const icon = header.createSpan("para-folder-icon");
    setIcon(icon, config.icon);

    header.createSpan({ cls: "para-folder-name", text: config.name });
    header.createSpan({ cls: "para-folder-count", text: String(noteCount) });

    if (!exists) header.addClass("para-folder-missing");

    const toggle = () => {
      if (!exists) return;
      if (this.collapsed.has(config.id)) {
        this.collapsed.delete(config.id);
      } else {
        this.collapsed.add(config.id);
      }
      this.render();
    };
    chevron.setAttr("role", "button");
    chevron.setAttr("tabindex", "0");
    chevron.setAttr("aria-label", `Expand or collapse ${config.name}`);
    chevron.addEventListener("click", (evt) => {
      evt.stopPropagation();
      toggle();
    });
    chevron.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        evt.stopPropagation();
        toggle();
      }
    });

    const openDashboard = () => {
      if (exists && this.collapsed.has(config.id)) {
        this.collapsed.delete(config.id);
        this.render();
      }
      void this.plugin.openFolderDashboard(config);
    };
    header.addEventListener("click", openDashboard);
    header.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openDashboard();
      }
    });

    if (isExpanded && exists) {
      const body = section.createDiv("para-folder-body");
      this.renderTree(body, abstract, 0);
    }

    return section;
  }

  private renderTree(parent: HTMLElement, folder: TFolder, depth: number): void {
    const children = folder.children.slice().sort((a, b) => {
      const aFolder = a instanceof TFolder ? 0 : 1;
      const bFolder = b instanceof TFolder ? 0 : 1;
      return aFolder - bFolder || a.name.localeCompare(b.name);
    });

    for (const child of children) {
      if (child instanceof TFolder) {
        const row = this.renderRow(parent, child.name, depth, `Folder ${child.name}`);
        const isExpanded = this.expandedSubfolders.has(child.path);
        row.setAttr("aria-expanded", String(isExpanded));
        const body = parent.createDiv("para-tree-children");
        if (isExpanded) {
          this.renderTree(body, child, depth + 1);
        } else {
          body.hide();
        }
        const toggle = () => {
          if (this.expandedSubfolders.has(child.path)) {
            this.expandedSubfolders.delete(child.path);
            body.hide();
            row.setAttr("aria-expanded", "false");
          } else {
            this.expandedSubfolders.add(child.path);
            if (body.childElementCount === 0) this.renderTree(body, child, depth + 1);
            body.show();
            row.setAttr("aria-expanded", "true");
          }
        };
        row.addEventListener("click", toggle);
        row.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            toggle();
          }
        });
      } else if (child instanceof TFile && child.extension === "md") {
        const row = this.renderRow(parent, child.basename, depth, `Open ${child.basename}`);
        const open = () => void this.app.workspace.getLeaf("tab").openFile(child);
        row.addEventListener("click", open);
        row.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            open();
          }
        });
      }
    }
  }

  private renderRow(parent: HTMLElement, label: string, depth: number, ariaLabel: string): HTMLElement {
    const row = parent.createDiv("para-tree-row");
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.setAttr("role", "treeitem");
    row.setAttr("tabindex", "0");
    row.setAttr("aria-label", ariaLabel);
    row.createSpan({ cls: "para-tree-label", text: label });
    return row;
  }

}
