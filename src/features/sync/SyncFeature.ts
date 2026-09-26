import { StockApi } from "../../api";
import { getQueue, removeCommand, replaceArticlesIfQueueEmpty } from "../../db";
import type { TranslationKey } from "../../i18n";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export interface SyncFeatureContext {
  getEndpoint(): string;
  isOnline(): boolean;
  setNotice(value: string): void;
  t: Translate;
  refreshLocalData(): Promise<void>;
  renderSyncUpdate(): void;
}

export class SyncFeature {
  private syncing = false;
  private syncRequested = false;

  constructor(private readonly context: SyncFeatureContext) {}

  get isSyncing(): boolean {
    return this.syncing;
  }

  async synchronize(): Promise<void> {
    const c = this.context;
    if (!c.getEndpoint() || !c.isOnline()) return;
    if (this.syncing) {
      this.syncRequested = true;
      return;
    }

    this.syncing = true;
    this.syncRequested = false;
    c.setNotice("");
    c.renderSyncUpdate();
    try {
      const api = new StockApi(c.getEndpoint());
      const queue = await getQueue();
      for (const command of queue) {
        await api.send(command);
        await removeCommand(command.id);
      }
      const replaced = await replaceArticlesIfQueueEmpty(await api.getStock());
      if (!replaced) this.syncRequested = true;
      await c.refreshLocalData();
      c.setNotice(c.t("stockUpToDate"));
    } catch (error) {
      this.syncRequested = false;
      c.setNotice(
        error instanceof Error
          ? c.t("syncPaused", { error: error.message })
          : c.t("syncFailed")
      );
      await c.refreshLocalData();
    } finally {
      this.syncing = false;
      c.renderSyncUpdate();
      if (this.syncRequested) void this.synchronize();
    }
  }
}
