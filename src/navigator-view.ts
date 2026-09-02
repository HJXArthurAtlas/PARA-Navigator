import { ItemView, Menu, Notice, FileSystemAdapter, TFile, TFolder, setIcon } from "obsidian";
import type { TAbstractFile, WorkspaceLeaf } from "obsidian";
import type ParaNavigatorPlugin from "./main";
import { ColorPickerModal, IconPickerModal, renderIconValue } from "./pickers";
import { DEFAULT_SETTINGS } from "./settings";
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
  private creating: { basePath: string; afterName?: string } | null = null;
  /** Path of the node being renamed inline, if any */
  private renaming: string | null = null;
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

    const icon = header.createSpan("para-folder-icon");
    renderIconValue(icon, config.icon);

    const nameEl = header.createSpan({ cls: "para-folder-name", text: config.name });
    const nameColor = this.plugin.settings.nameColors[config.path];
    if (nameColor) nameEl.style.color = nameColor;
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
      this.addIconButton(header, "bar-chart-3", `Open ${config.name} dashboard`, () =>
        void this.plugin.openFolderDashboard(config)
      );
    }
    header.addEventListener("contextmenu", (evt) => {
      if (!exists) return;
      evt.preventDefault();
      this.showTopLevelMenu(evt, config);
    });

    const openNode = () => {
      // Row click only toggles the tree; the dashboard opens via its own icon.
      if (!exists) return;
      if (this.collapsed.has(config.id)) {
        this.collapsed.delete(config.id);
      } else {
        this.collapsed.add(config.id);
      }
      this.render();
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

    if (this.creating?.basePath === folder.path) {
      parent.appendChild(this.renderCreateInput(depth));
    }
  }

  /** A folder rendered as a note node; its content lives in `X/X.md`. */
  private renderFolderNode(parent: HTMLElement, folder: TFolder, depth: number): void {
    if (this.renaming === folder.path) {
      parent.appendChild(this.renderRenameInput(folder.name, folder.path));
      return;
    }
    const row = this.renderRow(parent, folder.name, depth, `Open note for ${folder.name}`, folder.path);
    this.attachRowDrag(row, folder.parent?.path ?? "", folder.name, folder.path, true);

    const chevron = createSpan("para-tree-chevron");
    row.insertBefore(chevron, row.firstChild);
    const folderNotePath = `${folder.path}/${folder.name}.md`;
    const hasChildren = folder.children.some(
      (child) => child instanceof TFolder || child.path !== folderNotePath
    );
    const open = () => void this.openFolderNote(folder);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        open();
      }
    });

    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.showFolderNodeMenu(evt, folder, hasChildren);
    });

    if (!hasChildren) {
      chevron.addClass("para-chevron-hidden");
      return;
    }
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

  }

  /** A plain file node. Markdown leaves can be converted into folder notes. */
  private renderLeafNode(parent: HTMLElement, file: TFile, depth: number): void {
    if (this.renaming === file.path) {
      parent.appendChild(this.renderRenameInput(file.basename, file.path));
      return;
    }
    const row = this.renderRow(parent, file.basename, depth, `Open ${file.name}`, file.path);
    this.attachRowDrag(row, file.parent?.path ?? "", file.name, file.path, false);
    // Placeholder keeps labels aligned with rows that have a real chevron.
    const placeholder = createSpan("para-tree-chevron para-chevron-hidden");
    row.insertBefore(placeholder, row.firstChild);

    const open = () => void this.app.workspace.getLeaf("tab").openFile(file);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        open();
      }
    });

    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.showLeafMenu(evt, file);
    });
  }
  private showTopLevelMenu(evt: MouseEvent, config: ParaFolderConfig): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle("创建下一级文件").setIcon("file-plus").onClick(() => this.startCreate(config.path))
    );
    menu.addItem((item) =>
      item
        .setTitle("打开看板")
        .setIcon("bar-chart-3")
        .onClick(() => void this.plugin.openFolderDashboard(config))
    );
    const defaultIcon = DEFAULT_SETTINGS.folders.find((f) => f.id === config.id)?.icon ?? "folder";
    this.addAppearanceItems(menu, config.path, {
      set: (id) => {
        config.icon = id;
      },
      clear:
        config.icon !== defaultIcon
          ? () => {
              config.icon = defaultIcon;
            }
          : null,
    });
    menu.showAtMouseEvent(evt);
  }

  private showFolderNodeMenu(evt: MouseEvent, folder: TFolder, hasChildren: boolean): void {
    const parentPath = folder.parent?.path ?? "";
    const menu = new Menu();
    if (hasChildren) {
      menu.addItem((item) =>
        item.setTitle("创建下一级文件").setIcon("file-plus").onClick(() => this.startCreate(folder.path))
      );
    }
    menu.addItem((item) =>
      item.setTitle("在下方创建文件").setIcon("file-plus").onClick(() => this.startCreate(parentPath, folder.name))
    );
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("重命名").setIcon("pencil").onClick(() => this.startRename(folder.path)));
    menu.addItem((item) => item.setTitle("创建副本").setIcon("copy").onClick(() => void this.duplicateItem(folder)));
    menu.addItem((item) =>
      item.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(() => void this.app.fileManager.trashFile(folder))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("在新标签页中打开").setIcon("arrow-up-right").onClick(() => void this.openFolderNoteIn(folder, "tab"))
    );
    menu.addItem((item) =>
      item.setTitle("在新标签组中打开").setIcon("columns-2").onClick(() => void this.openFolderNoteIn(folder, "split"))
    );
    menu.addItem((item) =>
      item.setTitle("在新窗口中打开").setIcon("app-window").onClick(() => void this.openFolderNoteIn(folder, "window"))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("复制绝对路径").setIcon("clipboard").onClick(() => this.copyPath(folder.path, true))
    );
    menu.addItem((item) =>
      item.setTitle("复制相对路径").setIcon("clipboard-list").onClick(() => this.copyPath(folder.path, false))
    );
    this.addAppearanceItems(menu, folder.path, this.nodeIconAccessor(folder.path));
    menu.showAtMouseEvent(evt);
  }

  private showLeafMenu(evt: MouseEvent, file: TFile): void {
    const parentPath = file.parent?.path ?? "";
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle("在下方创建文件").setIcon("file-plus").onClick(() => this.startCreate(parentPath, file.name))
    );
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("重命名").setIcon("pencil").onClick(() => this.startRename(file.path)));
    menu.addItem((item) => item.setTitle("创建副本").setIcon("copy").onClick(() => void this.duplicateItem(file)));
    menu.addItem((item) =>
      item.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(() => void this.app.fileManager.trashFile(file))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("在新标签页中打开").setIcon("arrow-up-right").onClick(() => this.openFileIn(file, "tab"))
    );
    menu.addItem((item) =>
      item.setTitle("在新标签组中打开").setIcon("columns-2").onClick(() => this.openFileIn(file, "split"))
    );
    menu.addItem((item) =>
      item.setTitle("在新窗口中打开").setIcon("app-window").onClick(() => this.openFileIn(file, "window"))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("复制绝对路径").setIcon("clipboard").onClick(() => this.copyPath(file.path, true))
    );
    menu.addItem((item) =>
      item.setTitle("复制相对路径").setIcon("clipboard-list").onClick(() => this.copyPath(file.path, false))
    );
    this.addAppearanceItems(menu, file.path, this.nodeIconAccessor(file.path));
    menu.showAtMouseEvent(evt);
  }

  /** Icon accessor backed by settings.nodeIcons for sub-level nodes. */
  private nodeIconAccessor(path: string): { set: (id: string) => void; clear: (() => void) | null } {
    const icons = this.plugin.settings.nodeIcons;
    return {
      set: (id) => {
        icons[path] = id;
      },
      clear: icons[path]
        ? () => {
            delete icons[path];
          }
        : null,
    };
  }

  private renderRow(parent: HTMLElement, label: string, depth: number, ariaLabel: string, path: string): HTMLElement {
    const row = parent.createDiv("para-tree-row");
    row.setAttr("role", "treeitem");
    row.setAttr("tabindex", "0");
    row.setAttr("aria-label", ariaLabel);
    const iconId = this.plugin.settings.nodeIcons[path];
    if (iconId) {
      const iconEl = row.createSpan("para-tree-icon");
      renderIconValue(iconEl, iconId);
    }
    const labelEl = row.createSpan({ cls: "para-tree-label", text: label });
    const color = this.plugin.settings.nameColors[path];
    if (color) labelEl.style.color = color;
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

  /** Icon/color customization items shared by every level's context menu. */
  private addAppearanceItems(
    menu: Menu,
    path: string,
    icon: { set: (id: string) => void; clear: (() => void) | null }
  ): void {
    const settings = this.plugin.settings;
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("选择图标").setIcon("image-plus").onClick(() => {
        new IconPickerModal(this.app, (id) => {
          icon.set(id);
          void this.persistAndRender();
        }).open();
      })
    );
    if (icon.clear) {
      const clear = icon.clear;
      menu.addItem((item) =>
        item.setTitle("删除图标").setIcon("image-off").onClick(() => {
          clear();
          void this.persistAndRender();
        })
      );
    }
    menu.addItem((item) =>
      item.setTitle("设置颜色").setIcon("palette").onClick(() => {
        new ColorPickerModal(this.app, settings.nameColors[path] ?? null, (color) => {
          settings.nameColors[path] = color;
          void this.persistAndRender();
        }).open();
      })
    );
    if (settings.nameColors[path]) {
      menu.addItem((item) =>
        item.setTitle("清除颜色").setIcon("eraser").onClick(() => {
          delete settings.nameColors[path];
          void this.persistAndRender();
        })
      );
    }
  }

  private async persistAndRender(): Promise<void> {
    await this.plugin.saveSettings();
    this.render();
  }

  private async openFolderNote(folder: TFolder): Promise<void> {
    const file = await this.plugin.ensureFolderNote(folder);
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private renderCreateInput(depth: number): HTMLElement {
    const row = createDiv("para-tree-row para-tree-editing");
    const input = row.createEl("input", { cls: "para-tree-input" });
    input.setAttr("type", "text");
    input.setAttr("placeholder", "note name");
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
          void this.createAndReveal(basePath.basePath, value, basePath.afterName);
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

  private startCreate(basePath: string, afterName?: string): void {
    this.creating = { basePath, afterName };
    // Make sure the target's children are visible so the input row shows.
    this.expandedSubfolders.add(basePath);
    const topLevel = this.plugin.settings.folders.find((folder) => folder.path === basePath);
    if (topLevel) this.collapsed.delete(topLevel.id);
    this.render();
    const input = this.containerEl.querySelector<HTMLInputElement>(".para-tree-input");
    input?.focus();
  }

  private async createAndReveal(basePath: string, name: string, afterName?: string): Promise<void> {
    const file = await this.plugin.createNote(basePath, name);
    if (!file) return;

    // "在下方创建文件": pin the new note right after the sibling in custom order.
    if (afterName) {
      const parent = this.app.vault.getAbstractFileByPath(basePath);
      if (parent instanceof TFolder) {
        const names = this.sortChildren(parent.children, basePath)
          .map((child) => child.name)
          .filter((entry) => entry !== file.name);
        const index = names.indexOf(afterName);
        names.splice(index >= 0 ? index + 1 : names.length, 0, file.name);
        this.plugin.settings.sortOrder[basePath] = names;
        await this.plugin.saveSettings();
      }
    }

    this.collapsed.delete(
      this.plugin.settings.folders.find((folder) => folder.path === basePath)?.id ?? ""
    );
    this.render();
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private startRename(path: string): void {
    this.renaming = path;
    this.render();
    const input = this.containerEl.querySelector<HTMLInputElement>(".para-tree-input");
    input?.focus();
    input?.select();
  }

  private renderRenameInput(currentName: string, path: string): HTMLElement {
    const row = createDiv("para-tree-row para-tree-editing");
    const input = row.createEl("input", { cls: "para-tree-input" });
    input.setAttr("type", "text");
    input.setAttr("aria-label", "Rename");
    input.value = currentName;

    const cancel = () => {
      this.renaming = null;
      this.render();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        const value = input.value.trim();
        const target = this.renaming;
        this.renaming = null;
        if (target && value.length > 0) {
          void this.commitRename(target, value);
        } else {
          this.render();
        }
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => {
      if (this.renaming) cancel();
    });
    return row;
  }

  private async commitRename(path: string, newName: string): Promise<void> {
    const item = this.app.vault.getAbstractFileByPath(path);
    const trimmed = newName.trim();
    if (!item || !trimmed || trimmed.includes("/")) {
      this.render();
      return;
    }
    const parentPath = item.parent?.path ?? "";
    const oldName = item.name;
    let targetName = trimmed;
    if (item instanceof TFile && !targetName.toLowerCase().endsWith(`.${item.extension.toLowerCase()}`)) {
      targetName = `${targetName}.${item.extension}`;
    }
    const targetPath = parentPath ? `${parentPath}/${targetName}` : targetName;
    if (targetPath === item.path) {
      this.render();
      return;
    }
    if (this.app.vault.getAbstractFileByPath(targetPath)) {
      new Notice(`Already exists: ${targetPath}`);
      this.render();
      return;
    }

    await this.app.fileManager.renameFile(item, targetPath);

    // Keep the folder note name in sync with its folder.
    if (item instanceof TFolder) {
      const movedNote = this.app.vault.getAbstractFileByPath(`${targetPath}/${oldName}.md`);
      if (movedNote instanceof TFile) {
        await this.app.fileManager.renameFile(movedNote, `${targetPath}/${targetName}.md`);
      }
    }

    // Update custom ordering: the parent's list and the node's own key.
    const parentOrder = this.plugin.settings.sortOrder[parentPath];
    if (parentOrder) {
      const index = parentOrder.indexOf(oldName);
      if (index >= 0) parentOrder[index] = targetName;
    }
    if (item instanceof TFolder && this.plugin.settings.sortOrder[path]) {
      this.plugin.settings.sortOrder[targetPath] = this.plugin.settings.sortOrder[path];
      delete this.plugin.settings.sortOrder[path];
    }
    await this.plugin.saveSettings();
    this.render();
  }

  private async duplicateItem(item: TAbstractFile): Promise<void> {
    const parentPath = item.parent?.path ?? "";
    const baseName = item instanceof TFile ? item.basename : item.name;
    const extension = item instanceof TFile ? `.${item.extension}` : "";
    let candidate = `${baseName} 副本`;
    let counter = 2;
    while (this.app.vault.getAbstractFileByPath(parentPath ? `${parentPath}/${candidate}${extension}` : `${candidate}${extension}`)) {
      candidate = `${baseName} 副本 ${counter++}`;
    }
    const newPath = parentPath ? `${parentPath}/${candidate}${extension}` : `${candidate}${extension}`;
    if (item instanceof TFile) {
      await this.app.vault.copy(item, newPath);
    } else if (item instanceof TFolder) {
      await this.copyFolder(item, newPath);
    }
    new Notice(`已创建副本: ${newPath}`);
  }

  private async copyFolder(folder: TFolder, destPath: string): Promise<void> {
    await this.app.vault.createFolder(destPath);
    for (const child of folder.children) {
      if (child instanceof TFile) {
        await this.app.vault.copy(child, `${destPath}/${child.name}`);
      } else if (child instanceof TFolder) {
        await this.copyFolder(child, `${destPath}/${child.name}`);
      }
    }
  }

  private copyPath(path: string, absolute: boolean): void {
    const adapter = this.app.vault.adapter;
    const text =
      absolute && adapter instanceof FileSystemAdapter ? `${adapter.getBasePath()}/${path}` : path;
    void navigator.clipboard.writeText(text);
    new Notice(absolute ? "已复制绝对路径" : "已复制相对路径");
  }

  private openFileIn(file: TFile, mode: "tab" | "split" | "window"): void {
    void this.app.workspace.getLeaf(mode).openFile(file);
  }

  private async openFolderNoteIn(folder: TFolder, mode: "tab" | "split" | "window"): Promise<void> {
    const note = await this.plugin.ensureFolderNote(folder);
    this.openFileIn(note, mode);
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
