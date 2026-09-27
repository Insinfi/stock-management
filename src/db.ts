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

export async function cacheArticlePhoto(barcode: string, photoDataUrl: string): Promise<void> {
  await transaction([ARTICLES], async (tx) => {
    const store = tx.objectStore(ARTICLES);
    const article = await requestResult<Article | undefined>(store.get(barcode));
    if (article) store.put({ ...article, photoDataUrl });
  });
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

export async function commitArticleUpdate(
  previousBarcode: string,
  article: Article,
  command: StockCommand
): Promise<void> {
  await transaction([ARTICLES, QUEUE, META], async (tx) => {
    const store = tx.objectStore(ARTICLES);
    const existing = await requestResult<Article | undefined>(store.get(article.barcode));
    if (article.barcode !== previousBarcode && existing) {
      throw new Error("An article with this barcode already exists.");
    }
    const sequence = await nextQueueSequence(tx);
    if (article.barcode !== previousBarcode) store.delete(previousBarcode);
    store.put(article);
    tx.objectStore(QUEUE).add({ ...command, sequence });
  });
}

export async function commitArticleDelete(barcode: string, command: StockCommand): Promise<void> {
  await transaction([ARTICLES, QUEUE, META], async (tx) => {
    const sequence = await nextQueueSequence(tx);
    const articles = tx.objectStore(ARTICLES);
    const deleted = await requestResult<Article | undefined>(articles.get(barcode));
    articles.delete(barcode);
    if (deleted?.groupId) {
      const members = await requestResult<Article[]>(articles.getAll());
      const remaining = members.filter((article) => article.groupId === deleted.groupId);
      if (remaining.length === 1) {
        articles.put({ ...remaining[0], groupId: undefined, groupName: undefined });
      }
    }
    tx.objectStore(QUEUE).add({ ...command, sequence });
  });
}

export async function commitGroupChange(
  articles: Article[],
  command: StockCommand
): Promise<void> {
  await transaction([ARTICLES, QUEUE, META], async (tx) => {
    const sequence = await nextQueueSequence(tx);
    const store = tx.objectStore(ARTICLES);
    for (const article of articles) store.put(article);
    tx.objectStore(QUEUE).add({ ...command, sequence });
  });
}

export async function commitArticlePhoto(
  article: Article,
  command: StockCommand
): Promise<void> {
  await transaction([ARTICLES, QUEUE, META], async (tx) => {
    const sequence = await nextQueueSequence(tx);
    tx.objectStore(ARTICLES).put(article);
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
    const currentArticles = await requestResult<Article[]>(store.getAll());
    const photos = new Map<string, string>();
    currentArticles.forEach((article) => {
      if (article.photoFileId && article.photoDataUrl) {
        photos.set(`${article.barcode}\u0000${article.photoFileId}`, article.photoDataUrl);
      }
    });
    store.clear();
    for (const article of articles) {
      const cachedPhoto = article.photoFileId
        ? photos.get(`${article.barcode}\u0000${article.photoFileId}`)
        : undefined;
      store.put(cachedPhoto ? { ...article, photoDataUrl: cachedPhoto } : article);
    }
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
