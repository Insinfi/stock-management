import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

export class BarcodeScanner {
  private reader = new BrowserMultiFormatReader();
  private controls?: IScannerControls;

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

  stop(): void {
    this.controls?.stop();
    this.controls = undefined;
  }
}
