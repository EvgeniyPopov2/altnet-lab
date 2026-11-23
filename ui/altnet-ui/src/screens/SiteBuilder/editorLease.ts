import type { DraftWriter } from "./draftPersistence";

export type LeaseResult = "owned" | "busy" | "unsupported";
type Locks = Pick<LockManager, "request">;
const LOCK_NAME = "altnet-sitebuilder-editor-v1";

/** Одна вкладка редактирует черновик; блокировка удерживается до завершения записи. */
export class EditorLease {
  private references = 0;
  private state: "idle" | "checking" | "held" | "releasing" | "busy" | "unsupported" = "idle";
  private acquiring?: Promise<LeaseResult>;
  private released?: Promise<unknown>;
  private releaseHold?: () => void;

  constructor(privateLocks: Locks | undefined, privateWriter: DraftWriter | undefined) {
    this.locks = privateLocks;
    this.writer = privateWriter;
    this.writer?.subscribe(() => { if (!this.references) this.maybeRelease(); });
  }
  private locks: Locks | undefined;
  private writer: DraftWriter | undefined;

  acquire(): Promise<LeaseResult> {
    this.references++;
    return this.obtain();
  }

  private async obtain(): Promise<LeaseResult> {
    if (this.state === "held") return "owned";
    if (this.state === "unsupported") return "unsupported";
    if (this.state === "releasing") { await this.released; return this.obtain(); }
    if (this.acquiring) return this.acquiring;
    if (!this.locks) { this.state = "unsupported"; return "unsupported"; }
    this.state = "checking";
    this.acquiring = new Promise(resolve => {
      try {
        this.released = this.locks!.request(LOCK_NAME, { ifAvailable: true }, async lock => {
          this.acquiring = undefined;
          if (!lock) { this.state = "busy"; resolve("busy"); return; }
          this.state = "held";
          const held = new Promise<void>(release => { this.releaseHold = release; });
          resolve("owned");
          if (!this.references) this.maybeRelease();
          await held;
          this.state = "idle";
        }).catch(() => {
          this.acquiring = undefined;
          this.state = "unsupported";
          resolve("unsupported");
        });
      } catch {
        this.acquiring = undefined;
        this.state = "unsupported";
        resolve("unsupported");
      }
    });
    return this.acquiring;
  }

  release(): void {
    this.references = Math.max(0, this.references - 1);
    // Даём повторному монтированию редактора занять ту же блокировку.
    void Promise.resolve().then(() => this.maybeRelease());
  }

  private maybeRelease(): void {
    if (this.references || this.state !== "held" || !this.releaseHold) return;
    if (this.writer?.status === "failed" && this.writer.getUnsaved()) return;
    if (this.writer?.status === "saving") {
      void this.writer.waitForIdle().then(() => this.maybeRelease());
      return;
    }
    const release = this.releaseHold;
    this.releaseHold = undefined;
    this.state = "releasing";
    release();
  }
}

let sharedLease: EditorLease | undefined;
export function getSharedEditorLease(writer: DraftWriter | undefined): EditorLease {
  if (!sharedLease) {
    let locks: Locks | undefined;
    try { locks = typeof navigator !== "undefined" ? navigator.locks : undefined; } catch { locks = undefined; }
    sharedLease = new EditorLease(locks, writer);
  }
  return sharedLease;
}
