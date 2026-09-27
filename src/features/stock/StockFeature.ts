import {
  cacheArticlePhoto,
  commitArticleDelete,
  commitArticlePhoto,
  commitArticleUpdate,
  commitMovement,
  commitNewArticle
} from "../../db";
import type { Article, StockCommand } from "../../types";
import type { TranslationKey } from "../../i18n";
import { StockApi } from "../../api";
import { createId } from "../../utils/id";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;
type Screen = "stock" | "scan";
type CreationDraft = { name: string; quantity: string };
type ArticleDraft = { name: string; barcode: string } | undefined;

export interface StockFeatureContext {
  getEndpoint(): string;
  isOnline(): boolean;
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
  replaceNavigation(): void;
  refreshLocalData(): Promise<void>;
  synchronize(): Promise<void>;
  stopScanner(): void;
  startScanner(): Promise<void>;
  root: HTMLElement;
}

export class StockFeature {
  private readonly photoCache = new Map<string, string>();
  private readonly photoRequests = new Map<string, Promise<string>>();
  private activePhotoRequests = 0;
  private readonly photoRequestQueue: Array<() => void> = [];

  constructor(private readonly context: StockFeatureContext) {}

  async loadPhotos(): Promise<void> {
    const c = this.context;
    if (!c.getEndpoint() || !c.isOnline()) return;
    const fileIds = new Set(
      Array.from(c.root.querySelectorAll<HTMLElement>("[data-photo-file-id]"))
        .map((element) => element.dataset.photoFileId)
        .filter((fileId): fileId is string => Boolean(fileId))
    );
    await Promise.all(Array.from(fileIds, async (fileId) => {
      try {
        const photo = await this.getPhoto(fileId);
        this.renderPhoto(fileId, photo);
        const article = c.getArticles().find((item) => item.photoFileId === fileId);
        if (article) {
          await cacheArticlePhoto(article.barcode, photo);
          await c.refreshLocalData();
        }
      } catch (error) {
        console.warn("Could not load an article photo.", error);
      }
    }));
  }

  private async getPhoto(fileId: string): Promise<string> {
    const cached = this.photoCache.get(fileId);
    if (cached) return cached;
    const pending = this.photoRequests.get(fileId);
    if (pending) return pending;

    const request = this.withPhotoRequestSlot(
      () => new StockApi(this.context.getEndpoint()).getPhoto(fileId)
    ).then((photo) => {
      this.photoCache.set(fileId, photo);
      return photo;
    }).finally(() => {
      this.photoRequests.delete(fileId);
    });
    this.photoRequests.set(fileId, request);
    return request;
  }

  private async withPhotoRequestSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activePhotoRequests >= 3) {
      await new Promise<void>((resolve) => this.photoRequestQueue.push(resolve));
    }
    this.activePhotoRequests += 1;
    try {
      return await operation();
    } finally {
      this.activePhotoRequests -= 1;
      this.photoRequestQueue.shift()?.();
    }
  }

  private renderPhoto(fileId: string, source: string): void {
    const c = this.context;
    c.root.querySelectorAll<HTMLElement>("[data-photo-file-id]").forEach((placeholder) => {
      if (placeholder.dataset.photoFileId !== fileId) return;
      const variant = placeholder.dataset.photoVariant;
      const image = document.createElement("img");
      image.className = variant === "detail"
        ? "article-photo"
        : "article-symbol article-thumbnail";
      image.src = source;
      image.alt = placeholder.dataset.photoAlt ?? "";
      image.loading = "eager";
      if (variant !== "detail") image.setAttribute("aria-hidden", "true");
      const fallback = placeholder.cloneNode(true);
      image.addEventListener("error", () => {
        this.photoCache.delete(fileId);
        image.replaceWith(fallback);
      }, { once: true });
      placeholder.replaceWith(image);
    });
  }

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

  async handlePhotoChange(input: HTMLInputElement): Promise<void> {
    const barcode = input.dataset.barcode;
    const file = input.files?.[0];
    input.value = "";
    if (!barcode || !file) return;
    try {
      const c = this.context;
      const article = c.getArticles().find((item) => item.barcode === barcode);
      if (!article) throw new Error(c.t("articleMissing"));
      const photoDataUrl = await compressPhoto(file, c.t);
      const updated: Article = {
        ...article,
        photoDataUrl,
        updatedAt: new Date().toISOString()
      };
      const command: StockCommand = {
        id: createId(),
        kind: "set-photo",
        barcode,
        photoDataUrl,
        createdAt: updated.updatedAt
      };
      await commitArticlePhoto(updated, command);
      await c.refreshLocalData();
      c.setNotice(c.t("photoSaved"));
      c.render();
      void c.synchronize();
    } catch (error) {
      const c = this.context;
      c.setNotice(error instanceof Error ? error.message : c.t("photoProcessingFailed"));
      c.render();
    }
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
      id: createId(),
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
    c.replaceNavigation();
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
      id: createId(),
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
    c.replaceNavigation();
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
      id: createId(),
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
    c.replaceNavigation();
    c.render();
    void c.synchronize();
  }

  private async deleteArticle(barcode: string): Promise<void> {
    const c = this.context;
    const article = c.getArticles().find((item) => item.barcode === barcode);
    if (!article) throw new Error(c.t("articleMissing"));
    if (!window.confirm(c.t("deleteArticleConfirm", { name: article.name }))) return;
    const command: StockCommand = {
      id: createId(),
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
    c.replaceNavigation();
    c.render();
    void c.synchronize();
  }

  private async generateBarcode(): Promise<void> {
    const c = this.context;
    const existing = new Set(c.getArticles().map((article) => article.barcode));
    let barcode: string;
    do {
      const suffix = createId().replace(/-/g, "").slice(0, 16).toUpperCase();
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

async function compressPhoto(file: File, t: Translate): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(t("photoProcessingFailed"));
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 800;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t("photoProcessingFailed"));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result
          ? resolve(result)
          : reject(new Error(t("photoProcessingFailed"))),
        "image/jpeg",
        0.6
      );
    });
    if (blob.size > 250_000) throw new Error(t("photoTooLarge"));
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error(t("photoProcessingFailed")));
      reader.onerror = () => reject(reader.error ?? new Error(t("photoProcessingFailed")));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}
