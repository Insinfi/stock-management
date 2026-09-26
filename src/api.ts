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
    return frameRequest<Article[]>(this.endpoint, { action: "getStock" }, "GET");
  }

  async send(command: StockCommand): Promise<void> {
    await frameRequest<true>(
      this.endpoint,
      { action: "command", payload: JSON.stringify(command) },
      "POST"
    );
  }
}
