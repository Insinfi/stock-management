import type { Article, StockCommand } from "./types";

const DATABASE_NAME = "stockroom";
const DATABASE_VERSION = 2;
const ARTICLES = "articles";
const QUEUE = "queue";
const META = "meta";

type StoredCommand = StockCommand & { sequence: number };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARTICLES)) {
        database.createObjectStore(ARTICLES, { keyPath: "barcode" });
      }
      if (!database.objectStoreNames.contains(QUEUE)) {
        database.createObjectStore(QUEUE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(META)) {
        database.createObjectStore(META, { keyPath: "key" });
      }
      if (event.oldVersion < 2) {
        const tx = request.transaction;
        if (!tx) throw new Error("Could not upgrade local stock storage.");
        const commands: StockCommand[] = [];
        const cursorRequest = tx.objectStore(QUEUE).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            commands.push(cursor.value as StockCommand);
            cursor.continue();
          } else {
            commands.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
            commands.forEach((command, index) => {
              tx.objectStore(QUEUE).put({ ...command, sequence: index + 1 });
            });
            tx.objectStore(META).put({ key: "queueSequence", value: commands.length });
          }
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local stock storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not access local stock storage."));
  });
}

async function transaction<T>(
  stores: string[],
  operation: (tx: IDBTransaction) => Promise<T>
): Promise<T> {
  const database = await openDatabase();
  const tx = database.transaction(stores, "readwrite");
  const result = operation(tx);

  try {
    const value = await result;
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save local stock changes."));
      tx.onabort = () => reject(tx.error ?? new Error("Local stock changes were cancelled."));
    });
    return value;
  } finally {
    database.close();
  }
}

export async function getArticles(): Promise<Article[]> {
  const database = await openDatabase();
  try {
    const tx = database.transaction(ARTICLES, "readonly");
    const values = await requestResult<Article[]>(tx.objectStore(ARTICLES).getAll());
    return values.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    database.close();
  }
}

export async function getArticle(barcode: string): Promise<Article | undefined> {
  const database = await openDatabase();
  try {
    return await requestResult<Article | undefined>(
      database.transaction(ARTICLES, "readonly").objectStore(ARTICLES).get(barcode)
    );
  } finally {
    database.close();
  }
}

export async function getQueue(): Promise<StockCommand[]> {
  const database = await openDatabase();
  try {
    const records = await requestResult<StoredCommand[]>(
      database.transaction(QUEUE, "readonly").objectStore(QUEUE).getAll()
    );
    return records
      .sort((a, b) => a.sequence - b.sequence);
  } finally {
    database.close();
  }
}

export async function commitMovement(
  article: Article,
  command: StockCommand
): Promise<void> {
  await transaction([ARTICLES, QUEUE, META], async (tx) => {
    const sequence = await nextQueueSequence(tx);
    tx.objectStore(ARTICLES).put(article);
    tx.objectStore(QUEUE).add({ ...command, sequence });
  });
}

export async function commitNewArticle(
  article: Article,
  command: StockCommand
): Promise<void> {
  await transaction([ARTICLES, QUEUE, META], async (tx) => {
    const sequence = await nextQueueSequence(tx);
    tx.objectStore(ARTICLES).add(article);
    tx.objectStore(QUEUE).add({ ...command, sequence });
  });
}

export async function removeCommand(id: string): Promise<void> {
  await transaction([QUEUE], async (tx) => {
    tx.objectStore(QUEUE).delete(id);
  });
}

export async function replaceArticlesIfQueueEmpty(articles: Article[]): Promise<boolean> {
  return transaction([ARTICLES, QUEUE], async (tx) => {
    const commands = await requestResult<StockCommand[]>(tx.objectStore(QUEUE).getAll());
    if (commands.length) return false;
    const store = tx.objectStore(ARTICLES);
    store.clear();
    for (const article of articles) store.put(article);
    return true;
  });
}

async function nextQueueSequence(tx: IDBTransaction): Promise<number> {
  const store = tx.objectStore(META);
  const current = await requestResult<{ key: string; value: number } | undefined>(store.get("queueSequence"));
  const sequence = (current?.value ?? 0) + 1;
  store.put({ key: "queueSequence", value: sequence });
  return sequence;
}
