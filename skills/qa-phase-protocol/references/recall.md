# Recall: lessons before authoring (CONTRACTS §23)

This is preflight step 5 of the phase protocol. It reads one index, a few hundred tokens at most. It
is the step that turns a lesson learned in one feature's runs into a change in what the next design,
plan or script does.

```bash
npm run qa:learn -- recall --skill <the skill this phase invokes> [--type <t>] [--module <m>] --shared
```

Run it from the QA root. Pass `--type` when the phase has one (`--type` filter, or the one enabled
type). Pass `--module` when the phase works on one module (the case id's `<MODULE>`, lowercased).
`--shared` adds up to three lessons Recall shares with every project; with no Recall it adds nothing.

| Output | Do |
|---|---|
| `No lesson applies.` | Nothing. Do not mention it. Go on. |
| An index of `LRN-…` lines, each with a probe | For each hit **whose probe is a question this phase will face**, run `npm run qa:learn -- show <id> …` once for all of them. Pass the lesson paths to the author in the dispatch as a path list: `Lessons: <qa-root>/learnings/LRN-….md`. Skip a hit whose probe is not your question. |
| `Shared, from other projects (Recall)` lines | Another project's habit. Pass the titles to the author as hypotheses, labelled `shared`. Never read one as a rule for this suite. |
| `(Recall unreachable …)` | Carry on with the local lessons. |
| `WARN … withheld` on stderr | The lesson scan flagged a lesson. Carry on without it and name it in the closing lines for `/qa-learn --audit`. |
| The script is missing or exits non-zero | Carry on. This step never stops a phase. |

The author treats a lesson as its first hypothesis. The case, the code and the run decide. When a
lesson contradicts the evidence, the author does not obey it: it says so in its summary as a gap,
and the lesson goes to `/qa-learn --audit`.

**The reviewer is not given the lessons.** `/qa-review`, `reviewing-cases`, `reviewing-unit-tests`
and `reviewing-test-pull-requests` judge the artifact against their checklist. A reviewer primed
with "what went wrong last time" stops seeing what is wrong this time. So the orchestrator leaves the
`Lessons:` line out of a review dispatch, and a review phase skips this step.

Phases that already recall in their own skill (`automation-engineer` before generating or healing,
`hunting-flaky-tests`) do not recall twice. The skill's own call is this step.
