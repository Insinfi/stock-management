export interface Article {
  barcode: string;
  name: string;
  quantity: number;
  updatedAt: string;
  groupId?: string;
  groupName?: string;
  photoFileId?: string;
  photoDataUrl?: string;
}

export interface GroupsFeatureViewState {
  activeGroupId?: string;
  selectingMembers: boolean;
  targetGroupId?: string;
  selectedBarcodes: string[];
  groupNameDraft: string;
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
    }
  | {
      id: string;
      kind: "update";
      previousBarcode: string;
      barcode: string;
      name: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "delete";
      barcode: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "set-group";
      groupId: string;
      groupName: string;
      barcodes: string[];
      createdAt: string;
    }
  | {
      id: string;
      kind: "remove-group-member";
      groupId: string;
      barcode: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "set-photo";
      barcode: string;
      photoDataUrl: string;
      createdAt: string;
    };

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
