# green-api-test

GREEN-API test assignment. The specification lives in `specs/original-spec.md`.

## How to use this file

This is a **table of contents, not documentation**. It holds only what must be
known on every task. Everything else lives in `docs/`, one file per topic. Read a
file when you work on its topic — never load `docs/` as a whole.

## Always

- Documentation, code, identifiers, replies and commit messages are in English; UI text is in Russian.
- Invent nothing beyond the specification. No requirement, no code.
- Credentials (`idInstance`, `apiTokenInstance`) stay in the user's runtime and
  never enter the repository.
- Touched code — leave one runnable check behind for non-trivial logic.

## Contents

| Document | Read it when |
|---|---|
| [docs/conventions/documentation.md](docs/conventions/documentation.md) | Writing or changing documentation |
| [docs/conventions/git.md](docs/conventions/git.md) | Committing, branching, opening a PR |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Implementing the assignment |
| [docs/technical-tasks.md](docs/technical-tasks.md) | Executing tasks and checking acceptance criteria |
| [docs/architecture.md](docs/architecture.md) | Implementing state, chat identity, or API integration |

`AGENTS.md` is a symlink to this file, so Codex and Claude read the same source.
