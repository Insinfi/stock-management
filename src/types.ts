export interface Article {
  barcode: string;
  name: string;
  quantity: number;
  updatedAt: string;
}

export type StockCommand =
  | {
      id: string;
      kind: "create";
      barcode: string;
      name: string;
      quantity: number;
      createdAt: string;
    }
  | {
      id: string;
      kind: "movement";
      barcode: string;
      movementType: "add" | "remove";
      quantity: number;
      createdAt: string;
    };

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
