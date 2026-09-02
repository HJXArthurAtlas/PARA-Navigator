import { App, FuzzySuggestModal, Modal, Setting, getIconIds, setIcon } from "obsidian";
import type { FuzzyMatch } from "obsidian";

/** Searchable picker over every registered icon (lucide + plugin-provided). */
export class IconPickerModal extends FuzzySuggestModal<string> {
  private readonly onChoose: (iconId: string) => void;

  constructor(app: App, onChoose: (iconId: string) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("搜索图标名称…");
  }

  getItems(): string[] {
    return getIconIds();
  }

  getItemText(item: string): string {
    return item.replace(/^lucide-/, "");
  }

  renderSuggestion({ item }: FuzzyMatch<string>, el: HTMLElement): void {
    const iconEl = el.createSpan("para-icon-choice");
    setIcon(iconEl, item);
    el.createSpan({ text: this.getItemText(item) });
  }

  onChooseItem(item: string): void {
    this.onChoose(item);
  }
}

/** Simple color picker for node display names. */
export class ColorPickerModal extends Modal {
  private readonly current: string | null;
  private readonly onChoose: (color: string) => void;

  constructor(app: App, current: string | null, onChoose: (color: string) => void) {
    super(app);
    this.current = current;
    this.onChoose = onChoose;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("设置名称颜色");
    let value = this.current ?? "#c8a26a";
    new Setting(contentEl).setName("颜色").addColorPicker((picker) =>
      picker.setValue(value).onChange((next) => {
        value = next;
      })
    );
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("确定")
        .setCta()
        .onClick(() => {
          this.onChoose(value);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
