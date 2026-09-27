import type { ApiResult, Article, StockCommand } from "./types";

const RESPONSE_TIMEOUT_MS = 20_000;

function frameRequest<T>(
  endpoint: string,
  parameters: Record<string, string>,
  method: "GET" | "POST"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const nonce = crypto.randomUUID();
    const frame = document.createElement("iframe");
    const frameName = `stockroom-${nonce}`;
    frame.name = frameName;
    frame.title = "Stock service response";
    frame.hidden = true;
    let completed = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
      frame.remove();
    };

    const fail = (error: Error) => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(error);
    };

    const onMessage = (event: MessageEvent<ApiResult<T> & { nonce?: string }>) => {
      // Apps Script may deliver the response through a sandboxed frame, so WindowProxy identity is unreliable.
      if (event.data?.nonce !== nonce) return;
      if (completed) return;
      completed = true;
      cleanup();
      if (event.data.ok && event.data.data !== undefined) resolve(event.data.data);
      else reject(new Error(event.data.error || "The stock service rejected the request."));
    };

    const timeout = window.setTimeout(
      () => fail(new Error("The stock service did not respond. Check the deployment URL and access settings.")),
      RESPONSE_TIMEOUT_MS
    );
    window.addEventListener("message", onMessage);
    document.body.append(frame);

    if (method === "GET") {
      for (const [key, value] of Object.entries({ ...parameters, nonce })) {
        url.searchParams.set(key, value);
      }
      frame.src = url.toString();
      return;
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = url.toString();
    form.target = frameName;
    form.hidden = true;
    for (const [name, value] of Object.entries({ ...parameters, nonce })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    form.remove();
  });
}

export class StockApi {
  constructor(private readonly endpoint: string) {}

  async getStock(): Promise<Article[]> {
    const stock = await frameRequest<unknown>(this.endpoint, { action: "getStock" }, "GET");
    if (!Array.isArray(stock)) throw new Error("The stock service returned invalid article data.");
    const groupNames = new Map<string, string>();
    const articles = stock.map((value): Article => {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.barcode !== "string" ||
        !value.barcode.trim() ||
        value.barcode.length > 160 ||
        typeof value.name !== "string" ||
        !value.name.trim() ||
        value.name.length > 120 ||
        !Number.isSafeInteger(value.quantity) ||
        value.quantity < 0 ||
        typeof value.updatedAt !== "string" ||
        (value.groupId !== undefined && (typeof value.groupId !== "string" || !value.groupId.trim())) ||
        (value.groupName !== undefined && (typeof value.groupName !== "string" || !value.groupName.trim())) ||
        (value.photoFileId !== undefined && (typeof value.photoFileId !== "string" || !/^[\w-]{10,200}$/.test(value.photoFileId)))
      ) {
        throw new Error("The stock service returned invalid article data.");
      }
      const article: Article = {
        barcode: value.barcode,
        name: value.name,
        quantity: value.quantity,
        updatedAt: value.updatedAt
      };
      if (value.groupId && value.groupName) {
        if (
          value.groupId.length > 80 ||
          !/^[\w-]{8,80}$/.test(value.groupId) ||
          value.groupName.length > 120
        ) {
          throw new Error("The stock service returned invalid group data.");
        }
        const existingGroupName = groupNames.get(value.groupId);
        if (existingGroupName && existingGroupName !== value.groupName) {
          throw new Error("The stock service returned inconsistent group data.");
        }
        groupNames.set(value.groupId, value.groupName);
        article.groupId = value.groupId;
        article.groupName = value.groupName;
      } else if (value.groupId || value.groupName) {
        throw new Error("The stock service returned incomplete group data.");
      }
      if (value.photoFileId) article.photoFileId = value.photoFileId;
      return article;
    });
    const barcodes = new Set<string>();
    for (const article of articles) {
      if (barcodes.has(article.barcode)) {
        throw new Error("The stock service returned duplicate article barcodes.");
      }
      barcodes.add(article.barcode);
    }
    return articles;
  }

  async send(command: StockCommand): Promise<void> {
    const result = await frameRequest<unknown>(
      this.endpoint,
      { action: "command", payload: JSON.stringify(command) },
      "POST"
    );
    if (result !== true) throw new Error("The stock service did not confirm the command.");
  }
}
