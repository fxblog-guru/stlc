// cleanup.ts — the teardown ledger behind every factory. A factory registers the undo of what it
// created at the moment it creates it; the `cleanup` fixture runs the ledger in reverse after the
// test, whatever the outcome. Nothing is shared between tests, so a failed test can never make
// the next one delete the wrong data.
// QA_KEEP_ON_FAIL=1 keeps a failed test's data for debugging (the sweeper removes it later).

export type Undo = () => Promise<unknown>;

export class Cleanup {
  private readonly undos: { label: string; undo: Undo }[] = [];

  /** Register the undo of something just created. Called by factories, not by specs. */
  add(label: string, undo: Undo): void {
    this.undos.push({ label, undo });
  }

  /** Run every undo, newest first. Failures are collected, never thrown mid-way. */
  async run(): Promise<string[]> {
    const failures: string[] = [];
    for (const { label, undo } of [...this.undos].reverse()) {
      try {
        await undo();
      } catch (e) {
        failures.push(`${label}: ${String(e)}`);
      }
    }
    this.undos.length = 0;
    return failures;
  }

  get size(): number {
    return this.undos.length;
  }
}
