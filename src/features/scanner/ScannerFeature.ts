import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import type { TranslationKey } from "../../i18n";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export class ScannerFeature {
  private readonly reader = new BrowserMultiFormatReader();
  private controls?: IScannerControls;
  private torchEnabled = false;
  private generation = 0;

  private get supportsTorch(): boolean {
    return typeof this.controls?.switchTorch === "function";
  }

  stop(): void {
    this.generation += 1;
    this.controls?.stop();
    this.controls = undefined;
    this.torchEnabled = false;
  }

  async start(
    root: HTMLElement,
    onBarcode: (barcode: string) => void,
    onError: (error: unknown) => void,
    t: Translate
  ): Promise<void> {
    this.stop();
    const video = root.querySelector<HTMLVideoElement>("#scanner-video");
    if (!video) return;
    const generation = this.generation;
    try {
      const controls = await this.reader.decodeFromVideoDevice(
        undefined,
        video,
        (result) => {
          if (result && generation === this.generation) onBarcode(result.getText());
        }
      );
      if (generation !== this.generation) {
        controls.stop();
        return;
      }
      this.controls = controls;
      this.updateTorchButton(root, t);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      onError(error);
    }
  }

  renderTorchButton(t: Translate): string {
    return `<button class="flash-button" type="button" data-action="toggle-flash" aria-pressed="false" hidden>⚡ ${t("flashOff")}</button>`;
  }

  async handleAction(target: Element, root: HTMLElement, t: Translate): Promise<boolean> {
    const button = target.closest<HTMLButtonElement>('[data-action="toggle-flash"]');
    if (!button) return false;
    button.disabled = true;
    try {
      if (!this.controls?.switchTorch) throw new Error("Torch is not supported by this camera.");
      await this.controls.switchTorch(!this.torchEnabled);
      this.torchEnabled = !this.torchEnabled;
      this.updateTorchButton(root, t);
    } catch (error) {
      const hint = root.querySelector<HTMLElement>(".scanner-hint");
      if (hint) {
        const message = error instanceof Error ? error.message : t("cameraUnavailableFallback");
        hint.textContent = t("flashFailed", { error: message });
      }
    } finally {
      button.disabled = false;
    }
    return true;
  }

  private updateTorchButton(root: HTMLElement, t: Translate): void {
    const button = root.querySelector<HTMLButtonElement>('[data-action="toggle-flash"]');
    if (!button) return;
    button.hidden = !this.supportsTorch;
    button.setAttribute("aria-pressed", String(this.torchEnabled));
    button.textContent = `⚡ ${t(this.torchEnabled ? "flashOn" : "flashOff")}`;
  }
}

export const scannerFeature = new ScannerFeature();
