# Documentation

Read this when writing or changing documentation.

## Principle

Documentation is a tree of files, not one long file. The root `CLAUDE.md` (and its
`AGENTS.md` symlink) is a **table of contents**: links plus one line of "read it
when". The content lives in the leaves under `docs/`.

Why: an agent pulls only the leaf it needs into context instead of the whole rule
set. A single large `CLAUDE.md` is paid for on every request and goes stale as one
piece.

## Rules

- One file, one topic. 150 lines is not a ban but a review point: once a file
  reaches it, stop and check whether it is still a single topic.
- Every leaf under `docs/` gets a row in the `CLAUDE.md` contents table. No row,
  no leaf — nobody will read it. This does not apply to README, LICENSE or other
  files outside `docs/`.
- The first line after the heading answers: when is this file needed.
- Write what cannot be derived from the code: decisions, constraints, agreements.
  Do not restate the folder layout or function signatures.
- **Never copy someone else's documentation.** An external API contract belongs to
  its author — keep a link to the source and only our own decisions about using
  it. A copy goes stale silently and drifts from the original.
- Stack choices and other product decisions belong in `docs/architecture.md` with
  their rationale, not in style conventions.
- A stale document gets fixed or deleted. Wrong documentation is worse than none.
- Link between documents with relative paths so they work both on GitHub and
  locally.
- Documents are written in English; this rule includes this one.

## Layout

```
CLAUDE.md              contents + the "always" rules
AGENTS.md -> CLAUDE.md symlink for Codex
docs/
  conventions/         how we work (documentation, git)
  architecture.md      project decisions (arrives with the specification)
```

A new topic that fits no folder becomes a file directly under `docs/`. Three files
side by side is a review point: time to consider a folder.
