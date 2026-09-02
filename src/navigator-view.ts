import { ItemView, Notice, TFile, TFolder, setIcon } from "obsidian";
import type { TAbstractFile, WorkspaceLeaf } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import type { ParaFolderConfig } from "./settings";

export const VIEW_TYPE_NAVIGATOR = "para-navigator";

interface DraggedItem {
  topLevel: boolean;
  parentPath: string;
  name: string;
  path: string;
  isFolder: boolean;
}

/**
 * Every node in the tree is a note. Folders act as hierarchy carriers and are
 * represented by their folder note (`X/X.md`); the folder note itself is never
 * shown as a child row.
 */
export class NavigatorView extends ItemView {
  private readonly plugin: ParaNavigatorPlugin;
  private readonly collapsed = new Set<string>();
  /** Paths of expanded nodes — survives full re-renders */
  private readonly expandedSubfolders = new Set<string>();
  /** Pending inline note creation target folder path, if any */
  private creating: string | null = null;
  /** Row currently being dragged, if any */
  private dragged: DraggedItem | null = null;

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
      this.dragged = { topLevel: true, parentPath: "", name: config.id, path: config.path, isFolder: true };
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
      this.addIconButton(header, "plus", `New note in ${config.name}`, () => this.startCreate(config.path));
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

    const openNode = () => {
      if (exists && this.collapsed.has(config.id)) {
        this.collapsed.delete(config.id);
        this.render();
      }
      // Top-level PARA entries have no folder note — the dashboard is their content.
      void this.plugin.openFolderDashboard(config);
    };
    header.addEventListener("click", openNode);
    header.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openNode();
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
    const folderNotePath = `${folder.path}/${folder.name}.md`;

    for (const child of children) {
      if (child instanceof TFolder) {
        this.renderFolderNode(parent, child, depth);
      } else if (child instanceof TFile) {
        // The folder note is the node itself — never listed as a child.
        if (child.path === folderNotePath) continue;
        this.renderLeafNode(parent, child, depth);
      }
    }

    if (this.creating === folder.path) {
      parent.appendChild(this.renderCreateInput(depth));
    }
  }

  /** A folder rendered as a note node; its content lives in `X/X.md`. */
  private renderFolderNode(parent: HTMLElement, folder: TFolder, depth: number): void {
    const row = this.renderRow(parent, folder.name, depth, `Open note for ${folder.name}`);
    this.attachRowDrag(row, folder.parent?.path ?? "", folder.name, folder.path, true);

    const chevron = createSpan("para-tree-chevron");
    row.insertBefore(chevron, row.firstChild);
    const isExpanded = this.expandedSubfolders.has(folder.path);
    setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");
    chevron.setAttr("role", "button");
    chevron.setAttr("tabindex", "0");
    chevron.setAttr("aria-label", `Expand or collapse ${folder.name}`);
    row.setAttr("aria-expanded", String(isExpanded));

    const body = parent.createDiv("para-tree-children");
    if (isExpanded) {
      this.renderTree(body, folder, depth + 1);
    } else {
      body.hide();
    }

    const toggle = () => {
      if (this.expandedSubfolders.has(folder.path)) {
        this.expandedSubfolders.delete(folder.path);
        body.hide();
        row.setAttr("aria-expanded", "false");
        setIcon(chevron, "chevron-right");
      } else {
        this.expandedSubfolders.add(folder.path);
        if (body.childElementCount === 0) this.renderTree(body, folder, depth + 1);
        body.show();
        row.setAttr("aria-expanded", "true");
        setIcon(chevron, "chevron-down");
      }
    };
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

    const open = () => void this.openFolderNote(folder);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        open();
      }
    });

    this.addIconButton(row, "plus", `New note in ${folder.name}`, () => this.startCreate(folder.path));
  }

  /** A plain file node. Markdown leaves can be converted into folder notes. */
  private renderLeafNode(parent: HTMLElement, file: TFile, depth: number): void {
    const isMarkdown = file.extension === "md";
    const row = this.renderRow(parent, file.basename, depth, `Open ${file.name}`);
    this.attachRowDrag(row, file.parent?.path ?? "", file.name, file.path, false);

    const open = () => void this.app.workspace.getLeaf("tab").openFile(file);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        open();
      }
    });

    if (isMarkdown) {
      this.addIconButton(row, "plus", `New note under ${file.basename}`, () =>
        void this.startCreateUnderLeaf(file)
      );
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

  private addIconButton(parent: HTMLElement, iconName: string, label: string, onClick: () => void): void {
    const button = parent.createSpan("para-add-button");
    setIcon(button, iconName);
    button.setAttr("role", "button");
    button.setAttr("tabindex", "0");
    button.setAttr("aria-label", label);
    button.setAttr("data-tooltip-position", "top");
    button.addEventListener("click", (evt) => {
      evt.stopPropagation();
      onClick();
    });
    button.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        evt.stopPropagation();
        onClick();
      }
    });
  }

  private async openFolderNote(folder: TFolder): Promise<void> {
    const file = await this.plugin.ensureFolderNote(folder);
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private renderCreateInput(depth: number): HTMLElement {
    const row = createDiv("para-tree-row para-tree-editing");
    row.style.paddingLeft = `${8 + depth * 12}px`;
    const input = row.createEl("input", { cls: "para-tree-input" });
    input.setAttr("type", "text");
    input.setAttr("placeholder", "note name (a/b works)");
    input.setAttr("aria-label", "New note name");

    const cancel = () => {
      this.creating = null;
      this.render();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        const value = input.value.trim();
        const basePath = this.creating;
        this.creating = null;
        if (basePath && value.length > 0) {
          void this.createAndReveal(basePath, value);
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

  private startCreate(basePath: string): void {
    this.creating = basePath;
    // Make sure the target's children are visible so the input row shows.
    this.expandedSubfolders.add(basePath);
    const topLevel = this.plugin.settings.folders.find((folder) => folder.path === basePath);
    if (topLevel) this.collapsed.delete(topLevel.id);
    this.render();
    const input = this.containerEl.querySelector<HTMLInputElement>(".para-tree-input");
    input?.focus();
  }

  /** Converts a leaf note into a folder note, then offers inline child creation. */
  private async startCreateUnderLeaf(file: TFile): Promise<void> {
    const folder = await this.plugin.convertLeafToFolderNote(file);
    if (!folder) return;
    this.startCreate(folder.path);
  }

  private async createAndReveal(basePath: string, relativePath: string): Promise<void> {
    const created = await this.plugin.createEntry(basePath, relativePath, "note");
    if (!created) return;

    // Expand the parent chain so the new note is visible after re-render.
    const parentPath = created.includes("/") ? created.slice(0, created.lastIndexOf("/")) : "";
    let cursor = basePath;
    const remainder = parentPath.startsWith(`${basePath}/`) ? parentPath.slice(basePath.length + 1) : "";
    for (const segment of remainder.split("/").filter((part) => part.length > 0)) {
      cursor = `${cursor}/${segment}`;
      this.expandedSubfolders.add(cursor);
    }
    this.collapsed.delete(
      this.plugin.settings.folders.find((folder) => folder.path === basePath)?.id ?? ""
    );
    this.render();

    const file = this.app.vault.getAbstractFileByPath(created);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf("tab").openFile(file);
    }
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
      this.dragged = { topLevel: false, parentPath, name, path, isFolder };
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
      // Folders and markdown leaves (via conversion) accept move-into drops.
      const targetAccepts = isFolder || path.toLowerCase().endsWith(".md");
      const canDropInto = targetAccepts && this.canMoveInto(dragged.path, isFolder ? path : path.slice(0, -".md".length));
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
      const targetAccepts = isFolder || path.toLowerCase().endsWith(".md");
      const canDropInto = targetAccepts && this.canMoveInto(dragged.path, isFolder ? path : path.slice(0, -".md".length));
      if (!sameParent && !canDropInto) return;
      evt.preventDefault();
      evt.stopPropagation();
      const zone = this.dropZone(evt, row, sameParent && canDropInto);
      if (zone === "into" || !sameParent) {
        void this.moveIntoNode(dragged.path, path, isFolder);
      } else {
        void this.reorderChildren(parentPath, dragged.name, name, zone === "before");
      }
    });
  }

  /** True when draggedPath may be moved into the folder at targetFolderPath. */
  private canMoveInto(draggedPath: string, targetFolderPath: string): boolean {
    if (draggedPath === targetFolderPath) return false;
    if (targetFolderPath.startsWith(`${draggedPath}/`)) return false;
    const draggedParent = draggedPath.slice(0, draggedPath.lastIndexOf("/"));
    return draggedParent !== targetFolderPath;
  }

  /** Middle zone of a row means "move into" when allowed. */
  private dropZone(evt: DragEvent, el: HTMLElement, allowInto: boolean): "before" | "into" | "after" {
    if (!allowInto) return this.isBeforeMidpoint(evt, el) ? "before" : "after";
    const rect = el.getBoundingClientRect();
    const ratio = (evt.clientY - rect.top) / rect.height;
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "into";
  }

  private isBeforeMidpoint(evt: DragEvent, el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return evt.clientY < rect.top + rect.height / 2;
  }

  private markDropTarget(el: HTMLElement, before: boolean): void {
    this.clearDragIndicators();
    el.addClass(before ? "para-drop-before" : "para-drop-after");
  }

  private markDropInto(el: HTMLElement): void {
    this.clearDragIndicators();
    el.addClass("para-drop-into");
  }

  private clearDragIndicators(): void {
    this.containerEl
      .querySelectorAll(".para-drop-before, .para-drop-after, .para-drop-into")
      .forEach((el) => el.removeClass("para-drop-before", "para-drop-after", "para-drop-into"));
  }

  /** Moves an item under a node, converting a markdown leaf into a folder note first if needed. */
  private async moveIntoNode(draggedPath: string, targetPath: string, targetIsFolder: boolean): Promise<void> {
    let folderPath = targetPath;
    if (!targetIsFolder) {
      const file = this.app.vault.getAbstractFileByPath(targetPath);
      if (!(file instanceof TFile)) return;
      const folder = await this.plugin.convertLeafToFolderNote(file);
      if (!folder) return;
      folderPath = folder.path;
    }
    await this.moveItem(draggedPath, folderPath);
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
}
