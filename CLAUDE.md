# green-api-test

GREEN-API test assignment. The specification has not been received yet.

## How to use this file

This is a **table of contents, not documentation**. It holds only what must be
known on every task. Everything else lives in `docs/`, one file per topic. Read a
file when you work on its topic — never load `docs/` as a whole.

## Always

- Documentation, code and identifiers in English. Replies and commit messages in Russian.
- Invent nothing beyond the specification. No requirement, no code.
- Credentials (`idInstance`, `apiTokenInstance`) stay in the user's runtime and
  never enter the repository.
- Touched code — leave one runnable check behind for non-trivial logic.

## Contents

| Document | Read it when |
|---|---|
| [docs/conventions/documentation.md](docs/conventions/documentation.md) | Writing or changing documentation |
| [docs/conventions/git.md](docs/conventions/git.md) | Committing, branching, opening a PR |
| `docs/architecture.md` | Will appear together with the specification |

`AGENTS.md` is a symlink to this file, so Codex and Claude read the same source.
