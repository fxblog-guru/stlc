# Comments in generated scripts

The next reader of a script is usually `/qa-heal`, `/qa-triage` or a reviewer with none of this
session's context. The code says **what** it does; a comment exists only for what it cannot say.

## Required

- **`// Step N: <step>`** (or `# Step N:`) for each case step, where the generator's skill asks for
  it. These are traceability: they map the script back to the case. They are not the "restates the
  line" noise below.
- **`COVERAGE-GAP: Step N — <reason>`** for a step that cannot be automated.
- **A reason on every waiver:** an `exclude`, a `lock`, a `test.skip` or `fixme`, a raised timeout,
  a retry, a `waitFor` with no locator. Name the cause: a `DEF-NNN`, a `slow-test:` cause, or the
  case's reviewed reason.
- **A non-obvious locator or wait:** why the stable locator is not used (`// no testid on the
  legacy grid — DEF-031`), or which event the wait is for.

## Never

- A restatement of the next line (`// click the button`, `// assert status is 200`).
- History, "healed on <date>" or "was X before". The heal log and the commit keep that.
- Commented-out steps or assertions. A step that is gone is a `COVERAGE-GAP`, not a comment.
- A `TODO` with no `DEF-NNN`, `CLR-NNN` or case id.

When `/qa-heal` changes a line, it fixes or deletes the comment above that line in the same edit.
A comment that contradicts its code is a review finding.
