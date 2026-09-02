import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";

export type CreateKind = "folder" | "note";

/**
 * Prompts for a slash-separated relative path and creates either a folder
 * chain or a note under a given base folder.
 */
export class CreateEntryModal extends Modal {
  private readonly basePath: string;
  private readonly onSubmit: (relativePath: string, kind: CreateKind) => void;
  private inputEl!: HTMLInputElement;

  constructor(app: App, basePath: string, onSubmit: (relativePath: string, kind: CreateKind) => void) {
    super(app);
    this.basePath = basePath;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("para-create-modal");
    contentEl.createEl("h3", { text: `Create in ${this.basePath}` });

    new Setting(contentEl)
      .setName("Path")
      .setDesc("Use slashes for nested folders, e.g. area/topic/sub. Notes get .md automatically.")
      .addText((text) => {
        this.inputEl = text.inputEl;
        text.setPlaceholder("folder/subfolder or note name");
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            this.submit(this.inputEl.value.trim().toLowerCase().endsWith(".md") ? "note" : "folder");
          }
        });
      });

    const actions = contentEl.createDiv("para-create-actions");
    const folderButton = actions.createEl("button", { text: "Create folder" });
    folderButton.addEventListener("click", () => this.submit("folder"));
    const noteButton = actions.createEl("button", { text: "Create note", cls: "mod-cta" });
    noteButton.addEventListener("click", () => this.submit("note"));

    this.inputEl.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private submit(kind: CreateKind): void {
    const value = this.inputEl.value.trim();
    if (value.length === 0) {
      new Notice("Enter a name first.");
      return;
    }
    this.close();
    this.onSubmit(value, kind);
  }
}
