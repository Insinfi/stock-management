import { commitGroupChange } from "../../db";
import type { Article, GroupsFeatureViewState, StockCommand } from "../../types";
import type { TranslationKey } from "../../i18n";
import { createId } from "../../utils/id";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export interface GroupsFeatureContext {
  getArticles(): Article[];
  setNotice(value: string): void;
  t: Translate;
  render(): void;
  replaceNavigation(): void;
  refreshLocalData(): Promise<void>;
  synchronize(): Promise<void>;
}

export class GroupsFeature {
  private activeGroupId?: string;
  private selectingMembers = false;
  private targetGroupId?: string;
  private readonly selectedBarcodes = new Set<string>();
  private groupNameDraft = "";

  constructor(private readonly context: GroupsFeatureContext) {}

  get viewState(): GroupsFeatureViewState {
    return {
      activeGroupId: this.activeGroupId,
      selectingMembers: this.selectingMembers,
      targetGroupId: this.targetGroupId,
      selectedBarcodes: [...this.selectedBarcodes],
      groupNameDraft: this.groupNameDraft
    };
  }

  reset(): void {
    this.activeGroupId = undefined;
    this.stopSelecting();
  }

  restore(state: GroupsFeatureViewState): void {
    this.activeGroupId = state.activeGroupId;
    this.selectingMembers = state.selectingMembers;
    this.targetGroupId = state.targetGroupId;
    this.selectedBarcodes.clear();
    state.selectedBarcodes.forEach((barcode) => this.selectedBarcodes.add(barcode));
    this.groupNameDraft = state.groupNameDraft;
  }

  toggleMember(barcode: string, selected: boolean): void {
    if (!this.selectingMembers) return;
    if (selected) this.selectedBarcodes.add(barcode);
    else this.selectedBarcodes.delete(barcode);
  }

  updateGroupName(name: string): void {
    this.groupNameDraft = name;
  }

  async handleSubmit(form: HTMLFormElement): Promise<boolean> {
    if (form.dataset.form !== "create-group") return false;
    const name = String(new FormData(form).get("groupName") ?? "").trim();
    if (!name) throw new Error(this.context.t("groupNameRequired"));
    if (name.length > 120) throw new Error(this.context.t("groupNameTooLong"));
    if (this.selectedBarcodes.size < 2) throw new Error(this.context.t("groupNeedsItems"));

    const id = createId();
    const selected = [...this.selectedBarcodes];
    await this.setGroup(id, name, selected);
    this.context.setNotice(this.context.t("groupCreated", { name }));
    this.activeGroupId = id;
    this.stopSelecting();
    this.context.replaceNavigation();
    this.context.render();
    void this.context.synchronize();
    return true;
  }

  async handleAction(action: string, target: Element): Promise<boolean> {
    const c = this.context;
    if (action === "start-group-selection") {
      this.activeGroupId = undefined;
      this.beginSelecting();
    } else if (action === "cancel-group-selection") {
      this.stopSelecting();
    } else if (action === "open-group") {
      const id = target.closest<HTMLElement>("[data-group-id]")?.dataset.groupId;
      if (!id) return true;
      this.activeGroupId = id;
      this.stopSelecting();
    } else if (action === "close-group") {
      this.activeGroupId = undefined;
      this.stopSelecting();
    } else if (action === "add-group-members") {
      if (!this.activeGroupId) return true;
      this.beginSelecting(this.activeGroupId);
    } else if (action === "apply-group-members") {
      try {
        await this.addSelectedMembers();
      } catch (error) {
        c.setNotice(error instanceof Error ? error.message : c.t("saveFailed"));
        c.render();
      }
    } else if (action === "remove-group-member") {
      const element = target.closest<HTMLElement>("[data-barcode]");
      const barcode = element?.dataset.barcode;
      const groupId = element?.dataset.groupId;
      if (barcode && groupId) {
        try {
          await this.removeMember(barcode, groupId);
        } catch (error) {
          c.setNotice(error instanceof Error ? error.message : c.t("saveFailed"));
          c.render();
        }
      }
    } else {
      return false;
    }
    c.render();
    return true;
  }

  private beginSelecting(targetGroupId?: string): void {
    this.selectingMembers = true;
    this.targetGroupId = targetGroupId;
    this.selectedBarcodes.clear();
    this.groupNameDraft = "";
  }

  private stopSelecting(): void {
    this.selectingMembers = false;
    this.targetGroupId = undefined;
    this.selectedBarcodes.clear();
    this.groupNameDraft = "";
  }

  private async addSelectedMembers(): Promise<void> {
    const groupId = this.targetGroupId;
    if (!groupId || this.selectedBarcodes.size === 0) return;
    const members = this.context.getArticles().filter((article) => article.groupId === groupId);
    const groupName = members[0]?.groupName;
    if (!groupName || members.some((article) => article.groupName !== groupName)) {
      throw new Error(this.context.t("groupNoLongerAvailable"));
    }
    await this.setGroup(groupId, groupName, [...this.selectedBarcodes]);
    this.context.setNotice(this.context.t("groupItemsAdded", { count: this.selectedBarcodes.size }));
    this.stopSelecting();
    this.context.replaceNavigation();
    this.context.render();
    void this.context.synchronize();
  }

  private async setGroup(groupId: string, groupName: string, barcodes: string[]): Promise<void> {
    const c = this.context;
    const selected = new Set(barcodes);
    const articles = c.getArticles();
    const members = articles.filter((article) => selected.has(article.barcode));
    if (members.length !== selected.size) throw new Error(c.t("groupNoLongerAvailable"));
    if (members.some((article) => article.groupId && article.groupId !== groupId)) {
      throw new Error(c.t("groupMemberAlreadyGrouped"));
    }

    const updated = members.map((article) => ({ ...article, groupId, groupName }));
    const command: StockCommand = {
      id: createId(),
      kind: "set-group",
      groupId,
      groupName,
      barcodes: members.map((article) => article.barcode),
      createdAt: new Date().toISOString()
    };
    await commitGroupChange(updated, command);
    await c.refreshLocalData();
  }

  private async removeMember(barcode: string, groupId: string): Promise<void> {
    const c = this.context;
    const member = c.getArticles().find((article) => article.barcode === barcode && article.groupId === groupId);
    if (!member) throw new Error(c.t("groupNoLongerAvailable"));
    const remaining = c.getArticles().filter(
      (article) => article.groupId === groupId && article.barcode !== barcode
    );
    const updates: Article[] = [{ ...member, groupId: undefined, groupName: undefined }];
    if (remaining.length === 1) {
      updates.push({ ...remaining[0], groupId: undefined, groupName: undefined });
    }
    const command: StockCommand = {
      id: createId(),
      kind: "remove-group-member",
      groupId,
      barcode,
      createdAt: new Date().toISOString()
    };
    await commitGroupChange(updates, command);
    await c.refreshLocalData();
    c.setNotice(
      remaining.length === 1
        ? c.t("groupSplit")
        : c.t("groupMemberRemoved", { name: member.name })
    );
    if (remaining.length <= 1) this.activeGroupId = undefined;
    c.replaceNavigation();
    c.render();
    void c.synchronize();
  }
}
