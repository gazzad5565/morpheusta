# Primer for fresh Claude sessions

> Auto-loaded on every new Claude Code session. Keep it short — this
> burns context on every turn. Anything more than 30 lines of guidance
> belongs in `docs/`.

## What this repo is

**Morpheus Ops** — admin web console + mobile rep PWA for field-
operations teams. Two Next.js apps in `morpheus-admin/` and
`morpheus-mobile/`, both deployed to Vercel, both backed by one
Supabase project.

## Where to read what (BEFORE doing any work)

1. **`README.md`** — lean index of everything else. Has the "Latest
   commit" pointer at the top.
2. **`docs/SESSIONS.md`** — what shipped, when, why. Always read the
   newest entry at the top before suggesting a change so you know
   the current state.
3. **`docs/ROADMAP.md`** — what's next + what's deferred. Read this
   when the user asks "what should we work on?".
4. **`docs/OPS.md`** — deploy, migrations, Vercel traps, push pipeline.
5. **`docs/ARCHITECTURE.md`** — stack, schema, RLS, auth flow.
6. **`docs/CHEATSHEET.md`** — common tasks + files-of-note map.

## Project-specific rules

- **Next.js 16 with breaking changes** from your training data. The
  `morpheus-admin/AGENTS.md` and `morpheus-mobile/AGENTS.md` both warn
  to read `node_modules/next/dist/docs/` before writing app-router
  code.
- **Cross-platform always**: every mobile change must be considered
  for iOS Safari standalone PWA AND Android Chrome. State explicitly
  in your response which platforms you considered and the behaviour
  on each. iOS standalone PWA has bitten us repeatedly with
  user-activation rules (photo capture, library file open, etc) —
  `await` between a tap handler and a `.click()` / `window.open()`
  drops the activation flag and the OS silently blocks the popup.
- **Verify before claiming done**: run `npx --no-install next build`
  in any app you've changed before saying it ships.
- **Commits**: prefer NEW commits over amends. Include a Co-Authored-By
  trailer. Use HEREDOC for multi-line commit messages.

## When in doubt

Read `docs/SESSIONS.md`'s top entry — it's the most current
description of what's in the codebase right now.

## Behavioural baseline

The four-section behavioural baseline (Think Before Coding, Simplicity
First, Surgical Changes, Goal-Driven Execution) is imported below and
loaded with every session.

@docs/CLAUDE_BEHAVIOR.md
