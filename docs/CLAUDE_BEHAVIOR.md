# CLAUDE.md — behavioural baseline

Behavioral guidelines to reduce common LLM coding mistakes. Merge with
project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For
trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?"
If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals. This project has no test suite
yet (see `docs/ROADMAP.md` item 8), so verification means manual
smoke tests + build + browser checks, NOT writing automated tests
unless the user explicitly asks for them:

- "Add validation" → Add it; trigger the failing case in a browser
  tab; describe what you observed; confirm `next build` is clean.
- "Fix the bug" → Reproduce it manually first; describe what you did
  to trigger it; ship the fix; describe what you did to confirm it's
  gone (and ideally check it stays gone after a reload / different
  state).
- "Refactor X" → List the behaviours that must remain identical;
  verify each by manual smoke test; report which you checked.

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria
("make it work") require constant clarification.

**When something goes sideways:** stop and re-plan. If a verification
step fails or a mid-task discovery invalidates the original plan,
surface the divergence to the user before continuing. Don't accumulate
hacks to keep the original path alive.

## 5. Root cause, not the symptom

**Fix the cause. If you can't, name the trade-off out loud.**

When a build / test / check fails, fix the cause. Don't:
- Wrap an error in try-catch to suppress it.
- Silence TypeScript with `as any`.
- Comment out the failing line.
- Add a special-case branch to skip the broken path.
- Drop a `TODO: fix properly` and move on silently.

If you genuinely need a temporary fix because the real one is out of
scope, do BOTH:
1. Leave a one-line `TODO:` comment at the patch site explaining
   what's deferred and what triggers the proper fix.
2. Flag it in your response to the user so they can accept or reject
   the trade-off. A silent shortcut is undetectable; a surfaced
   trade-off is reviewable.

---

**These guidelines are working if:** fewer unnecessary changes in
diffs, fewer rewrites due to overcomplication, and clarifying
questions come before implementation rather than after mistakes.
