import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

export class BarcodeScanner {
  private reader = new BrowserMultiFormatReader();
  private controls?: IScannerControls;
  private torchEnabled = false;

  get supportsTorch(): boolean {
    return typeof this.controls?.switchTorch === "function";
  }

  get isTorchEnabled(): boolean {
    return this.torchEnabled;
  }

  async start(video: HTMLVideoElement, onBarcode: (barcode: string) => void): Promise<void> {
    this.stop();
    this.controls = await this.reader.decodeFromVideoDevice(
      undefined,
      video,
      (result) => {
        if (result) onBarcode(result.getText());
      }
    );
  }

  async setTorch(enabled: boolean): Promise<void> {
    const switchTorch = this.controls?.switchTorch;
    if (!switchTorch) throw new Error("Torch is not supported by this camera.");

    await switchTorch(enabled);
    this.torchEnabled = enabled;
  }

  stop(): void {
    this.controls?.stop();
    this.controls = undefined;
    this.torchEnabled = false;
  }
}
