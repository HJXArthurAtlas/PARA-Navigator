import { ItemView, Menu, Notice, TFile, TFolder, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { TAbstractFile } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import type { CreateKind } from "./main";
import type { ParaFolderConfig } from "./settings";

export const VIEW_TYPE_NAVIGATOR = "para-navigator";

export class NavigatorView extends ItemView {
  private readonly plugin: ParaNavigatorPlugin;
  private readonly collapsed = new Set<string>();
  /** Paths of expanded subfolders — survives full re-renders */
  private readonly expandedSubfolders = new Set<string>();
  /** Pending inline creation target, if any */
  private creating: { basePath: string; kind: CreateKind } | null = null;
  /** Row currently being dragged, if any */
  private dragged: { topLevel: boolean; parentPath: string; name: string; path: string } | null = null;

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
    header.setAttr("draggable", "true");
    header.addEventListener("dragstart", (evt) => {
      this.dragged = { topLevel: true, parentPath: "", name: config.id, path: config.path };
      evt.dataTransfer?.setData("text/plain", config.id);
      header.addClass("para-dragging");
    });
    header.addEventListener("dragend", () => {
      this.dragged = null;
      header.removeClass("para-dragging");
      this.clearDragIndicators();
    });
    header.addEventListener("dragover", (evt) => {
      const dragged = this.dragged;
      if (!dragged) return;
      if (dragged.topLevel) {
        evt.preventDefault();
        this.markDropTarget(header, this.isBeforeMidpoint(evt, header));
      } else if (this.canMoveInto(dragged.path, config.path)) {
        evt.preventDefault();
        this.markDropInto(header);
      }
    });
    header.addEventListener("drop", (evt) => {
      const dragged = this.dragged;
      if (!dragged) return;
      evt.preventDefault();
      if (dragged.topLevel) {
        void this.reorderTopLevel(dragged.name, config.id, this.isBeforeMidpoint(evt, header));
      } else if (this.canMoveInto(dragged.path, config.path)) {
        void this.moveItem(dragged.path, config.path);
      }
    });
    if (exists) {
      const add = header.createSpan("para-add-button");
      setIcon(add, "plus");
      add.setAttr("role", "button");
      add.setAttr("tabindex", "0");
      add.setAttr("aria-label", `Create folder or note in ${config.name}`);
      add.setAttr("data-tooltip-position", "top");
      add.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.showCreateMenu(config.path, evt);
      });
      add.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          evt.stopPropagation();
          this.showCreateMenu(config.path, evt);
        }
      });
    }

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
    const children = this.sortChildren(folder.children, folder.path);

    for (const child of children) {
      if (child instanceof TFolder) {
        const row = this.renderRow(parent, child.name, depth, `Folder ${child.name}`);
        this.attachRowDrag(row, folder.path, child.name, child.path, true);
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
        const add = row.createSpan("para-add-button");
        setIcon(add, "plus");
        add.setAttr("role", "button");
        add.setAttr("tabindex", "0");
        add.setAttr("aria-label", `Create folder or note in ${child.name}`);
        add.setAttr("data-tooltip-position", "top");
        add.addEventListener("click", (evt) => {
          evt.stopPropagation();
          this.showCreateMenu(child.path, evt);
        });
        add.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            evt.stopPropagation();
            this.showCreateMenu(child.path, evt);
          }
        });
      } else if (child instanceof TFile && child.extension === "md") {
        const row = this.renderRow(parent, child.basename, depth, `Open ${child.basename}`);
        this.attachRowDrag(row, folder.path, child.name, child.path, false);
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
    if (this.creating?.basePath === folder.path) {
      parent.appendChild(this.renderCreateInput(depth));
    }
  }
  private renderCreateInput(depth: number): HTMLElement {
    const creating = this.creating;
    const row = createDiv("para-tree-row para-tree-editing");
    row.style.paddingLeft = `${8 + depth * 12}px`;
    const input = row.createEl("input", { cls: "para-tree-input" });
    input.setAttr("type", "text");
    input.setAttr(
      "placeholder",
      creating?.kind === "note" ? "note name (folder/note works too)" : "folder/subfolder"
    );
    input.setAttr("aria-label", creating?.kind === "note" ? "New note name" : "New folder name");

    const cancel = () => {
      this.creating = null;
      this.render();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        const value = input.value.trim();
        const target = this.creating;
        this.creating = null;
        if (target && value.length > 0) {
          void this.createAndReveal(target.basePath, value, target.kind);
        } else {
          this.render();
        }
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => {
      if (this.creating) cancel();
    });
    return row;
  }

  private showCreateMenu(basePath: string, evt: MouseEvent | KeyboardEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("New folder")
        .setIcon("folder-plus")
        .onClick(() => this.startCreate(basePath, "folder"))
    );
    menu.addItem((item) =>
      item
        .setTitle("New note")
        .setIcon("file-plus")
        .onClick(() => this.startCreate(basePath, "note"))
    );
    if (evt instanceof MouseEvent) {
      menu.showAtMouseEvent(evt);
    } else {
      const target = evt.target;
      const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : null;
      menu.showAtPosition({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 });
    }
  }

  private startCreate(basePath: string, kind: CreateKind): void {
    this.creating = { basePath, kind };
    // Make sure the target's children are visible so the input row shows.
    this.expandedSubfolders.add(basePath);
    const topLevel = this.plugin.settings.folders.find((folder) => folder.path === basePath);
    if (topLevel) this.collapsed.delete(topLevel.id);
    this.render();
    const input = this.containerEl.querySelector<HTMLInputElement>(".para-tree-input");
    input?.focus();
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
  /** Orders children by the user's custom order, unlisted items appended by default sort. */
  private sortChildren(children: TAbstractFile[], parentPath: string): TAbstractFile[] {
    const defaultCompare = (a: TAbstractFile, b: TAbstractFile) => {
      const aFolder = a instanceof TFolder ? 0 : 1;
      const bFolder = b instanceof TFolder ? 0 : 1;
      return aFolder - bFolder || a.name.localeCompare(b.name);
    };
    const stored = this.plugin.settings.sortOrder[parentPath];
    if (!stored || stored.length === 0) return children.slice().sort(defaultCompare);
    const rank = new Map(stored.map((name, index) => [name, index]));
    return children.slice().sort((a, b) => {
      const rankA = rank.get(a.name);
      const rankB = rank.get(b.name);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      return defaultCompare(a, b);
    });
  }

  private attachRowDrag(row: HTMLElement, parentPath: string, name: string, path: string, isFolder: boolean): void {
    row.setAttr("draggable", "true");
    row.addEventListener("dragstart", (evt) => {
      this.dragged = { topLevel: false, parentPath, name, path };
      evt.dataTransfer?.setData("text/plain", name);
      evt.stopPropagation();
      row.addClass("para-dragging");
    });
    row.addEventListener("dragend", () => {
      this.dragged = null;
      row.removeClass("para-dragging");
      this.clearDragIndicators();
    });
    row.addEventListener("dragover", (evt) => {
      const dragged = this.dragged;
      if (!dragged || dragged.topLevel) return;
      const sameParent = dragged.parentPath === parentPath;
      const canDropInto = isFolder && this.canMoveInto(dragged.path, path);
      if (!sameParent && !canDropInto) return;
      evt.preventDefault();
      evt.stopPropagation();
      const zone = this.dropZone(evt, row, sameParent && canDropInto);
      if (zone === "into") {
        this.markDropInto(row);
      } else if (sameParent) {
        this.markDropTarget(row, zone === "before");
      } else {
        this.markDropInto(row);
      }
    });
    row.addEventListener("drop", (evt) => {
      const dragged = this.dragged;
      if (!dragged || dragged.topLevel) return;
      const sameParent = dragged.parentPath === parentPath;
      const canDropInto = isFolder && this.canMoveInto(dragged.path, path);
      if (!sameParent && !canDropInto) return;
      evt.preventDefault();
      evt.stopPropagation();
      const zone = this.dropZone(evt, row, sameParent && canDropInto);
      if (zone === "into" || !sameParent) {
        void this.moveItem(dragged.path, path);
      } else {
        void this.reorderChildren(parentPath, dragged.name, name, zone === "before");
      }
    });
  }

  /** True when draggedPath may be moved into targetFolderPath. */
  private canMoveInto(draggedPath: string, targetFolderPath: string): boolean {
    if (draggedPath === targetFolderPath) return false;
    if (targetFolderPath.startsWith(`${draggedPath}/`)) return false;
    const draggedParent = draggedPath.slice(0, draggedPath.lastIndexOf("/"));
    return draggedParent !== targetFolderPath;
  }

  /** Middle zone of a folder row means "move into" when allowed. */
  private dropZone(evt: DragEvent, el: HTMLElement, allowInto: boolean): "before" | "into" | "after" {
    if (!allowInto) return this.isBeforeMidpoint(evt, el) ? "before" : "after";
    const rect = el.getBoundingClientRect();
    const ratio = (evt.clientY - rect.top) / rect.height;
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "into";
  }

  private markDropInto(el: HTMLElement): void {
    this.clearDragIndicators();
    el.addClass("para-drop-into");
  }

  /** Moves a file or folder into another folder, updating links vault-wide. */
  private async moveItem(draggedPath: string, targetFolderPath: string): Promise<void> {
    const item = this.app.vault.getAbstractFileByPath(draggedPath);
    if (!item) return;
    const newPath = `${targetFolderPath}/${item.name}`;
    if (this.app.vault.getAbstractFileByPath(newPath)) {
      new Notice(`Already exists: ${newPath}`);
      return;
    }
    const parentPath = draggedPath.slice(0, draggedPath.lastIndexOf("/"));
    const order = this.plugin.settings.sortOrder[parentPath];
    if (order) {
      this.plugin.settings.sortOrder[parentPath] = order.filter((name) => name !== item.name);
      await this.plugin.saveSettings();
    }
    await this.app.fileManager.renameFile(item, newPath);
    this.expandedSubfolders.add(targetFolderPath);
    new Notice(`Moved to ${newPath}`);
  }

  private isBeforeMidpoint(evt: DragEvent, el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return evt.clientY < rect.top + rect.height / 2;
  }

  private markDropTarget(el: HTMLElement, before: boolean): void {
    this.clearDragIndicators();
    el.addClass(before ? "para-drop-before" : "para-drop-after");
  }

  private clearDragIndicators(): void {
    this.containerEl
      .querySelectorAll(".para-drop-before, .para-drop-after, .para-drop-into")
      .forEach((el) => el.removeClass("para-drop-before", "para-drop-after", "para-drop-into"));
  }

  private async reorderChildren(parentPath: string, draggedName: string, targetName: string, before: boolean): Promise<void> {
    if (draggedName === targetName) return;
    const parent = this.app.vault.getAbstractFileByPath(parentPath);
    if (!(parent instanceof TFolder)) return;
    const names = this.sortChildren(parent.children, parentPath)
      .map((child) => child.name)
      .filter((name) => name !== draggedName);
    const targetIndex = names.indexOf(targetName);
    if (targetIndex < 0) return;
    names.splice(before ? targetIndex : targetIndex + 1, 0, draggedName);
    this.plugin.settings.sortOrder[parentPath] = names;
    await this.plugin.saveSettings();
    this.render();
  }

  private async reorderTopLevel(draggedId: string, targetId: string, before: boolean): Promise<void> {
    if (draggedId === targetId) return;
    const folders = this.plugin.settings.folders;
    const draggedIndex = folders.findIndex((folder) => folder.id === draggedId);
    const targetIndex = folders.findIndex((folder) => folder.id === targetId);
    if (draggedIndex < 0 || targetIndex < 0) return;
    const [moved] = folders.splice(draggedIndex, 1);
    const insertAt = folders.findIndex((folder) => folder.id === targetId);
    folders.splice(before ? insertAt : insertAt + 1, 0, moved);
    await this.plugin.saveSettings();
    this.render();
  }
  
  private async createAndReveal(basePath: string, relativePath: string, kind: CreateKind): Promise<void> {
    const created = await this.plugin.createEntry(basePath, relativePath, kind);
    if (!created) return;

    // Expand the parent chain so the new entry is visible after re-render.
    const parentPath = created.includes("/") ? created.slice(0, created.lastIndexOf("/")) : "";
    let cursor = basePath;
    const remainder = parentPath.startsWith(`${basePath}/`) ? parentPath.slice(basePath.length + 1) : "";
    if (kind === "folder") {
      this.expandedSubfolders.add(created);
    }
    for (const segment of remainder.split("/").filter((part) => part.length > 0)) {
      cursor = `${cursor}/${segment}`;
      this.expandedSubfolders.add(cursor);
    }
    this.collapsed.delete(
      this.plugin.settings.folders.find((folder) => folder.path === basePath)?.id ?? ""
    );
    this.render();

    if (kind === "note") {
      const file = this.app.vault.getAbstractFileByPath(created);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf("tab").openFile(file);
      }
    } else {
      new Notice(`Created folder: ${created}`);
    }
  }

}
