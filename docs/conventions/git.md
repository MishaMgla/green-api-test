# Git

Read this before committing and before opening a PR.

- `main` is the working branch. A larger feature gets a `feat/<short-name>` branch
  and a PR.
- One commit is one finished change. Never commit "everything from today" at once.
- Commit message: first line in the imperative, up to 72 characters, in English.
  A body only when it has to explain *why*.
- If an agent took part in a commit, the commit ends with a trailer line
  `Co-Authored-By: <the actual participant>` — whoever really did the work.
  Do not add the trailer "just in case" and do not attribute someone else's work.
- `node_modules`, `dist` and local `.env` files belong in `.gitignore`, not in the
  repository.
- GREEN-API credentials never reach the repository, not even in examples. Use
  placeholders such as `1101000001` and `<apiTokenInstance>`.
- Never rewrite the history of `main`: no `push --force`, no `reset --hard` on a
  shared branch.
