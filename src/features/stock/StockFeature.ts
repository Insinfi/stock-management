import { commitArticleDelete, commitArticleUpdate, commitMovement, commitNewArticle } from "../../db";
import type { Article, StockCommand } from "../../types";
import type { TranslationKey } from "../../i18n";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;
type Screen = "stock" | "scan";
type CreationDraft = { name: string; quantity: string };
type ArticleDraft = { name: string; barcode: string } | undefined;

export interface StockFeatureContext {
  getArticles(): Article[];
  getSelectedBarcode(): string;
  setSelectedBarcode(value: string): void;
  setScreen(value: Screen): void;
  setCreatingArticle(value: boolean): void;
  setGeneratedBarcode(value: boolean): void;
  setGeneratedBarcodeSvg(value: string): void;
  getCreationDraft(): CreationDraft;
  setCreationDraft(value: CreationDraft): void;
  getEditingArticle(): boolean;
  setEditingArticle(value: boolean): void;
  getArticleDraft(): ArticleDraft;
  setArticleDraft(value: ArticleDraft): void;
  setNotice(value: string): void;
  t: Translate;
  formatNumber(value: number): string;
  render(): void;
  refreshLocalData(): Promise<void>;
  synchronize(): Promise<void>;
  stopScanner(): void;
  startScanner(): Promise<void>;
  root: HTMLElement;
}

export class StockFeature {
  constructor(private readonly context: StockFeatureContext) {}

  async handleSubmit(form: HTMLFormElement): Promise<boolean> {
    const kind = form.dataset.form;
    if (kind === "create") {
      this.context.setCreationDraft({
        name: String(new FormData(form).get("name") ?? ""),
        quantity: String(new FormData(form).get("quantity") ?? "0")
      });
      await this.createArticle(form);
      return true;
    }
    if (kind === "movement") {
      await this.recordMovement(form);
      return true;
    }
    if (kind === "edit-article") {
      await this.updateArticle(form);
      return true;
    }
    return false;
  }

  async handleAction(action: string, target: Element): Promise<boolean> {
    const c = this.context;
    if (action === "edit-article") {
      const article = c.getArticles().find((item) => item.barcode === c.getSelectedBarcode());
      if (!article) return true;
      c.setArticleDraft({ name: article.name, barcode: article.barcode });
      c.setEditingArticle(true);
      c.render();
    } else if (action === "cancel-article-edit") {
      c.setEditingArticle(false);
      c.setArticleDraft(undefined);
      c.render();
    } else if (action === "delete-article") {
      const barcode = target.closest<HTMLElement>("[data-barcode]")?.dataset.barcode;
      if (barcode) {
        try {
          await this.deleteArticle(barcode);
        } catch (error) {
          c.setNotice(error instanceof Error ? error.message : c.t("saveFailed"));
          c.render();
        }
      }
    } else if (action === "edit-stock") {
      const barcode = target.closest<HTMLElement>("[data-barcode]")?.dataset.barcode;
      if (!barcode) return true;
      c.stopScanner();
      c.setSelectedBarcode(barcode);
      c.setCreatingArticle(false);
      c.setGeneratedBarcode(false);
      c.setEditingArticle(false);
      c.setArticleDraft(undefined);
      c.setScreen("scan");
      c.setNotice("");
      c.render();
    } else if (action === "cancel-selection") {
      c.setSelectedBarcode("");
      c.setCreatingArticle(false);
      c.setGeneratedBarcode(false);
      c.setCreationDraft({ name: "", quantity: "0" });
      c.setEditingArticle(false);
      c.setArticleDraft(undefined);
      c.render();
      await c.startScanner();
    } else if (action === "create-handmade") {
      c.stopScanner();
      c.setSelectedBarcode("");
      c.setCreatingArticle(true);
      c.setGeneratedBarcode(false);
      c.setCreationDraft({ name: "", quantity: "0" });
      c.render();
    } else if (action === "generate-barcode") {
      await this.generateBarcode();
    } else if (action === "print-label") {
      window.print();
    } else {
      return false;
    }
    return true;
  }

  handleInput(target: HTMLInputElement): boolean {
    const c = this.context;
    if (target.name === "name" && c.getEditingArticle()) {
      const article = c.getArticles().find((item) => item.barcode === c.getSelectedBarcode());
      c.setArticleDraft({
        name: target.value,
        barcode: c.getArticleDraft()?.barcode ?? article?.barcode ?? c.getSelectedBarcode()
      });
    } else if (target.name === "barcode" && c.getEditingArticle()) {
      const article = c.getArticles().find((item) => item.barcode === c.getSelectedBarcode());
      c.setArticleDraft({
        name: c.getArticleDraft()?.name ?? article?.name ?? "",
        barcode: target.value
      });
    } else if (target.name === "name" && !c.getEditingArticle()) {
      const draft = { ...c.getCreationDraft(), name: target.value };
      c.setCreationDraft(draft);
      const labelName = c.root.querySelector<HTMLElement>(".print-label > strong");
      if (labelName) labelName.textContent = target.value.trim() || c.t("createHandmade");
    } else if (target.name === "quantity" && !c.getEditingArticle()) {
      c.setCreationDraft({ ...c.getCreationDraft(), quantity: target.value });
    } else {
      return false;
    }
    return true;
  }

  private quantityInput(form: HTMLFormElement): number {
    const value = Number(new FormData(form).get("quantity"));
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(this.context.t("wholeNumber"));
    return value;
  }

  private async createArticle(form: HTMLFormElement): Promise<void> {
    const c = this.context;
    const fields = new FormData(form);
    const name = String(fields.get("name") ?? "").trim();
    const quantity = this.quantityInput(form);
    if (!name) throw new Error(c.t("articleNameRequired"));
    if (!c.getSelectedBarcode()) throw new Error(c.t("invalidBarcode"));
    const article: Article = {
      barcode: c.getSelectedBarcode(),
      name,
      quantity,
      updatedAt: new Date().toISOString()
    };
    const command: StockCommand = {
      id: crypto.randomUUID(),
      kind: "create",
      barcode: article.barcode,
      name,
      quantity,
      createdAt: article.updatedAt
    };
    await commitNewArticle(article, command);
    await c.refreshLocalData();
    c.setSelectedBarcode("");
    c.setCreatingArticle(false);
    c.setGeneratedBarcode(false);
    c.setCreationDraft({ name: "", quantity: "0" });
    c.setScreen("stock");
    c.setNotice(c.t("articleAdded", { name }));
    c.render();
    void c.synchronize();
  }

  private async recordMovement(form: HTMLFormElement): Promise<void> {
    const c = this.context;
    const article = c.getArticles().find((item) => item.barcode === c.getSelectedBarcode());
    if (!article) throw new Error(c.t("articleMissing"));
    const fields = new FormData(form);
    const quantity = this.quantityInput(form);
    const movementType = fields.get("movementType");
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(c.t("minimumQuantity"));
    if (movementType !== "add" && movementType !== "remove") throw new Error(c.t("chooseMovement"));
    if (movementType === "remove" && quantity > article.quantity) {
      throw new Error(c.t("availableUnits", { count: c.formatNumber(article.quantity) }));
    }
    const nextQuantity = article.quantity + (movementType === "add" ? quantity : -quantity);
    if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) throw new Error(c.t("quantityRange"));
    const updated: Article = { ...article, quantity: nextQuantity, updatedAt: new Date().toISOString() };
    const command: StockCommand = {
      id: crypto.randomUUID(),
      kind: "movement",
      barcode: article.barcode,
      movementType,
      quantity,
      createdAt: updated.updatedAt
    };
    await commitMovement(updated, command);
    await c.refreshLocalData();
    c.setSelectedBarcode("");
    c.setScreen("stock");
    const movementNotice =
      movementType === "add"
        ? quantity === 1 ? "addedOne" : "addedMany"
        : quantity === 1 ? "removedOne" : "removedMany";
    c.setNotice(c.t(movementNotice, { count: c.formatNumber(quantity), name: article.name }));
    c.render();
    void c.synchronize();
  }

  private async updateArticle(form: HTMLFormElement): Promise<void> {
    const c = this.context;
    const original = c.getArticles().find((item) => item.barcode === c.getSelectedBarcode());
    if (!original) throw new Error(c.t("articleMissing"));
    const fields = new FormData(form);
    const name = String(fields.get("name") ?? "").trim();
    const barcode = String(fields.get("barcode") ?? "").trim();
    if (!name) throw new Error(c.t("articleNameRequired"));
    if (!barcode) throw new Error(c.t("invalidBarcode"));
    if (barcode.length > 160) throw new Error(c.t("barcodeTooLong"));
    const duplicate = c.getArticles().find(
      (item) => item.barcode === barcode && item.barcode !== original.barcode
    );
    if (duplicate) throw new Error(c.t("duplicateBarcode"));
    const updated: Article = { ...original, barcode, name, updatedAt: new Date().toISOString() };
    const command: StockCommand = {
      id: crypto.randomUUID(),
      kind: "update",
      previousBarcode: original.barcode,
      barcode,
      name,
      createdAt: updated.updatedAt
    };
    try {
      await commitArticleUpdate(original.barcode, updated, command);
    } catch (error) {
      if (error instanceof Error && error.message === "An article with this barcode already exists.") {
        throw new Error(c.t("duplicateBarcode"));
      }
      throw error;
    }
    await c.refreshLocalData();
    c.setSelectedBarcode("");
    c.setEditingArticle(false);
    c.setArticleDraft(undefined);
    c.setScreen("stock");
    c.setNotice(c.t("articleUpdated", { name }));
    c.render();
    void c.synchronize();
  }

  private async deleteArticle(barcode: string): Promise<void> {
    const c = this.context;
    const article = c.getArticles().find((item) => item.barcode === barcode);
    if (!article) throw new Error(c.t("articleMissing"));
    if (!window.confirm(c.t("deleteArticleConfirm", { name: article.name }))) return;
    const command: StockCommand = {
      id: crypto.randomUUID(),
      kind: "delete",
      barcode: article.barcode,
      createdAt: new Date().toISOString()
    };
    await commitArticleDelete(article.barcode, command);
    await c.refreshLocalData();
    c.setSelectedBarcode("");
    c.setEditingArticle(false);
    c.setArticleDraft(undefined);
    c.setScreen("stock");
    c.setNotice(c.t("articleDeleted", { name: article.name }));
    c.render();
    void c.synchronize();
  }

  private async generateBarcode(): Promise<void> {
    const c = this.context;
    const existing = new Set(c.getArticles().map((article) => article.barcode));
    let barcode: string;
    do {
      const random = crypto.getRandomValues(new Uint8Array(8));
      const suffix = Array.from(random, (value) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[value & 31]).join("");
      barcode = `SM-${Date.now().toString(36).toUpperCase()}-${suffix}`;
    } while (existing.has(barcode));

    try {
      const { default: JsBarcode } = await import("jsbarcode");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, barcode, {
        format: "CODE128",
        width: 2,
        height: 64,
        displayValue: false,
        margin: 4,
        lineColor: "#15231d",
        background: "#ffffff"
      });
      c.setSelectedBarcode(barcode);
      c.setGeneratedBarcodeSvg(svg.outerHTML);
      c.setGeneratedBarcode(true);
      c.render();
    } catch (error) {
      console.error("Could not generate an internal barcode.", error);
      c.setNotice(c.t("barcodeGenerationFailed"));
      c.render();
    }
  }
}
