import { App, Modal, Setting, getIconIds, setIcon } from "obsidian";
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

type IconTab = "icon" | "emoji";

const MAX_TILES = 200;

/** Display name used for search and tooltips. */
function iconDisplayName(item: string): string {
  const emoji = EMOJIS.find(([glyph]) => glyph === item);
  if (emoji) return emoji[1];
  return item.replace(/^lucide-/, "");
}

/** Tabbed picker: icon library and emojis live on separate tabs, each searchable. */
export class IconPickerModal extends Modal {
  private readonly onChoose: (iconId: string) => void;
  private tab: IconTab = "icon";
  private query = "";
  private listEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private tabButtons = new Map<IconTab, HTMLButtonElement>();

  constructor(app: App, onChoose: (iconId: string) => void) {
    super(app);
    this.onChoose = onChoose;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("选择图标");

    const tabs = contentEl.createDiv("para-icon-tabs");
    const tabDefs: [IconTab, string][] = [
      ["icon", "图标"],
      ["emoji", "Emoji"],
    ];
    for (const [id, label] of tabDefs) {
      const button = tabs.createEl("button", { cls: "para-icon-tab", text: label });
      button.addEventListener("click", () => {
        this.tab = id;
        for (const [tabId, el] of this.tabButtons) el.toggleClass("is-active", tabId === id);
        this.renderList();
        this.inputEl.focus();
      });
      this.tabButtons.set(id, button);
    }
    this.tabButtons.get(this.tab)?.addClass("is-active");

    this.inputEl = contentEl.createEl("input", { cls: "para-icon-search" });
    this.inputEl.setAttr("type", "text");
    this.inputEl.setAttr("placeholder", "搜索图标名称…");
    this.inputEl.addEventListener("input", () => {
      this.query = this.inputEl.value.trim().toLowerCase();
      this.renderList();
    });
    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        this.listEl.querySelector<HTMLElement>(".para-icon-tile")?.click();
      }
    });

    this.listEl = contentEl.createDiv("para-icon-grid");
    this.renderList();
    this.inputEl.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderList(): void {
    this.listEl.empty();
    const items = this.tab === "emoji" ? EMOJIS.map(([glyph]) => glyph) : getIconIds();
    const query = this.query;
    let shown = 0;
    for (const item of items) {
      const name = iconDisplayName(item);
      if (query && !name.toLowerCase().includes(query)) continue;
      const tile = this.listEl.createDiv("para-icon-tile");
      tile.setAttr("title", name);
      tile.setAttr("aria-label", name);
      renderIconValue(tile, item);
      tile.addEventListener("click", () => {
        this.onChoose(item);
        this.close();
      });
      if (++shown >= MAX_TILES) break;
    }
    if (shown === 0) {
      this.listEl.createDiv({ cls: "para-icon-empty", text: "无匹配图标" });
    }
  }
}

/** Preset swatches, always visible. Values are hex; the input accepts any CSS color. */
const COLOR_PALETTE = [
  "#f14c4c", "#fa7970", "#e5b567", "#d29922", "#f0c674", "#ffd866", "#57ab5a", "#6fdd8b",
  "#a6d189", "#539bf5", "#79c0ff", "#6cb6ff", "#39c5cf", "#b083f0", "#d2a8ff", "#f778ba",
  "#ff9bce", "#c8a26a", "#8b949e", "#adbac7", "#e6edf3", "#ffffff", "#909dab", "#636e7b",
];

/** Accepts hex/rgb(a)/hsl(a)/CSS color names; returns the normalized value or null. */
function parseColor(value: string): string | null {
  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = value.trim();
  return probe.style.color ? probe.style.color : null;
}

/** Color picker with free-form input (any CSS color) plus an always-visible palette. */
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
    titleEl.setText("设置颜色");

    let value = this.current ?? "";
    let parsed = value ? parseColor(value) : null;

    const inputRow = contentEl.createDiv("para-color-input-row");
    const preview = inputRow.createSpan("para-color-preview");
    const input = inputRow.createEl("input", { cls: "para-color-input" });
    input.setAttr("type", "text");
    input.setAttr("placeholder", "#e5b567 · rgb(229,181,103) · gold");
    input.value = value;

    const confirm = new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("确定")
        .setCta()
        .onClick(() => {
          if (!parsed) return;
          this.onChoose(parsed);
          this.close();
        })
    );

    const apply = (next: string): void => {
      value = next;
      input.value = next;
      parsed = parseColor(next);
      preview.style.backgroundColor = parsed ?? "transparent";
      input.toggleClass("is-invalid", next.length > 0 && parsed === null);
      confirm.components[0].setDisabled(parsed === null);
    };

    input.addEventListener("input", () => apply(input.value));
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && parsed) {
        evt.preventDefault();
        this.onChoose(parsed);
        this.close();
      }
    });

    const grid = contentEl.createDiv("para-color-grid");
    for (const swatch of COLOR_PALETTE) {
      const tile = grid.createDiv("para-color-tile");
      tile.style.backgroundColor = swatch;
      tile.setAttr("aria-label", swatch);
      tile.addEventListener("click", () => apply(swatch));
    }

    apply(value || "#c8a26a");
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
