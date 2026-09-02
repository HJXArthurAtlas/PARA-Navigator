import { App, FuzzySuggestModal, Modal, Setting, getIconIds, setIcon } from "obsidian";
import type { FuzzyMatch } from "obsidian";
/** Common emojis offered alongside lucide icons: [glyph, search keywords]. */
const EMOJIS: [string, string][] = [
  ["😀", "grinning"], ["😄", "smile"], ["😂", "joy"], ["😊", "blush"], ["😍", "heart-eyes"],
  ["🤔", "thinking"], ["😴", "sleeping"], ["🥳", "party"], ["😎", "cool"], ["🥹", "touched"],
  ["❤️", "heart red"], ["🧡", "heart orange"], ["💛", "heart yellow"], ["💚", "heart green"], ["💙", "heart blue"],
  ["💜", "heart purple"], ["🖤", "heart black"], ["🤍", "heart white"], ["💖", "heart sparkling"], ["💗", "heart growing"],
  ["⭐", "star"], ["🌟", "star glowing"], ["✨", "sparkles"], ["🔥", "fire"], ["⚡", "zap lightning"],
  ["💧", "droplet"], ["🌈", "rainbow"], ["☀️", "sun"], ["🌙", "moon"], ["⛅", "cloud sun"],
  ["📁", "folder"], ["📂", "folder open"], ["🗂️", "card index"], ["📚", "books"], ["📖", "book"],
  ["📝", "memo note"], ["📌", "pin"], ["📍", "pin round"], ["🔖", "bookmark"], ["🏷️", "label tag"],
  ["✅", "check done"], ["☑️", "checkbox"], ["❌", "cross"], ["⭕", "circle"], ["🟢", "circle green"],
  ["🔴", "circle red"], ["🟡", "circle yellow"], ["🔵", "circle blue"], ["🟣", "circle purple"], ["🟠", "circle orange"],
  ["🚀", "rocket"], ["✈️", "airplane"], ["🚗", "car"], ["🏠", "house home"], ["🏢", "office"],
  ["🏫", "school"], ["⛺", "tent"], ["🌍", "globe earth"], ["🗺️", "map"], ["🧭", "compass"],
  ["💡", "bulb idea"], ["🔍", "magnifier search"], ["🔧", "wrench"], ["🔨", "hammer"], ["⚙️", "gear"],
  ["🛠️", "tools"], ["🧰", "toolbox"], ["💻", "laptop"], ["🖥️", "desktop"], ["📱", "phone"],
  ["⌛", "hourglass"], ["⏰", "alarm clock"], ["📅", "calendar"], ["🗓️", "calendar spiral"], ["⏱️", "stopwatch"],
  ["🧮", "abacus"], ["💰", "money"], ["💳", "credit card"], ["🧾", "receipt"], ["💼", "briefcase"],
  ["🎯", "target goal"], ["🏆", "trophy"], ["🥇", "medal gold"], ["🏅", "medal"], ["👑", "crown"],
  ["💎", "gem diamond"], ["🔑", "key"], ["🔒", "lock"], ["🔓", "unlock"], ["🛡️", "shield"],
  ["📦", "package box"], ["🗃️", "card box"], ["🗄️", "file cabinet"], ["🗑️", "trash"], ["📥", "inbox tray"],
  ["📤", "outbox tray"], ["📮", "postbox"], ["✉️", "envelope"], ["📧", "email"], ["📨", "incoming"],
  ["👤", "person"], ["👥", "people"], ["🧑‍💻", "technologist"], ["👨‍👩‍👧", "family"], ["🤝", "handshake"],
  ["👍", "thumbs up"], ["👎", "thumbs down"], ["👏", "clap"], ["🙏", "pray thanks"], ["💪", "muscle strong"],
  ["🌱", "seedling"], ["🌲", "tree"], ["🌵", "cactus"], ["🍀", "clover"], ["🌸", "blossom"],
  ["🌺", "hibiscus"], ["🍎", "apple"], ["🍊", "tangerine"], ["🍋", "lemon"], ["🍉", "watermelon"],
  ["☕", "coffee"], ["🍵", "tea"], ["🍺", "beer"], ["🍷", "wine"], ["🥗", "salad"],
  ["🍜", "ramen"], ["🍣", "sushi"], ["🎂", "cake"], ["🍪", "cookie"], ["🥛", "milk"],
  ["🎵", "music"], ["🎧", "headphones"], ["🎬", "movie clapper"], ["📷", "camera"], ["🎨", "art paint"],
  ["🎮", "game"], ["🎲", "dice"], ["🧩", "puzzle"], ["🎁", "gift"], ["🎈", "balloon"],
  ["⚠️", "warning"], ["❗", "exclamation"], ["❓", "question"], ["💬", "speech chat"], ["🔔", "bell"],
  ["🔕", "bell off"], ["📢", "megaphone"], ["🚩", "flag"], ["🏁", "flag checkered"], ["🔮", "crystal ball"],
  ["🧠", "brain"], ["👀", "eyes"], ["💊", "pill"], ["🩺", "stethoscope"], ["🧘", "yoga meditate"],
  ["🏃", "running"], ["🚴", "cycling"], ["🏊", "swimming"], ["⚽", "soccer"], ["🏀", "basketball"],
  ["📊", "bar chart"], ["📈", "chart up"], ["📉", "chart down"], ["🗒️", "notepad"], ["🖊️", "pen"],
  ["✂️", "scissors"], ["🖇️", "paperclips"], ["📎", "paperclip"], ["📏", "ruler"], ["🧷", "safety pin"],
];

/** Emoji values are stored as plain glyphs; icon ids are kebab-case ASCII. */
export const isEmojiValue = (value: string): boolean => /[^\x00-\x7F]/.test(value);

/** Renders either an emoji glyph or a lucide/plugin icon into the element. */
export function renderIconValue(el: HTMLElement, value: string): void {
  if (isEmojiValue(value)) {
    el.addClass("para-emoji-icon");
    el.setText(value);
  } else {
    setIcon(el, value);
  }
}

/** Searchable picker over every registered icon (lucide + plugin-provided). */
export class IconPickerModal extends FuzzySuggestModal<string> {
  private readonly onChoose: (iconId: string) => void;

  constructor(app: App, onChoose: (iconId: string) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("搜索图标名称…");
  }

  getItems(): string[] {
    return [...EMOJIS.map(([glyph]) => glyph), ...getIconIds()];
  }

  getItemText(item: string): string {
    const emoji = EMOJIS.find(([glyph]) => glyph === item);
    if (emoji) return `${emoji[0]} ${emoji[1]}`;
    return item.replace(/^lucide-/, "");
  }

  renderSuggestion({ item }: FuzzyMatch<string>, el: HTMLElement): void {
    const iconEl = el.createSpan("para-icon-choice");
    renderIconValue(iconEl, item);
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
