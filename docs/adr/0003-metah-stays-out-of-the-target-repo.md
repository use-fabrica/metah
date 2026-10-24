# metah's tooling stays out of the target repo

The Tracker (Specs, Tickets, Review findings) and the Skill Pack live in metah, not in the target repo. metah injects the skills a Session's Stage needs (with every skill and file they pull in) into that Session's opening message; Sessions never load skills themselves, and metah adds no tools of its own. Agents write Tracker files into a self-ignoring `.metah/` directory in the WorkOrder worktree (it carries its own `.gitignore` of `*`, so neither tracked files nor the repo's `.git` are touched), and metah parses them. Only the repo's own domain docs (GLOSSARY, ADRs) may commit to the Integration Branch, switchable per project.

## Considered options

- **Local-files Tracker in `.scratch/` + vendored `.agents/skills/` on the Integration Branch**: rejected; puts tooling into the target repo's PR.
- **Each CLI's native skill loading**: rejected; only Claude Code has a per-run flag (`--add-dir`). Codex needs `CODEX_HOME` relocation, which moves `auth.json`, or a global `~/.agents/skills` install; OpenCode has no confirmed per-run skill path.
- **A metah MCP toolkit (`spec.publish`, `tickets.publish`, `run.complete`) inside t3code's thread-scoped `t3-code` server**: deferred; structured, but Antigravity has no confirmed per-thread MCP and v1 supports every t3code provider. It remains the fallback if parsing drift bites.

## Consequences

- Every Stage advances only on the user's Gate click; metah parses the Tracker files at that moment and refuses the Gate if they don't parse.
- A Run is done when its turn ends with new commits and the injected sentinel line `RUN COMPLETE`; a turn that ends without it means the Run needs input.
- t3code has no per-thread system prompt, so the injected skills ride a Session's first user message. metah never manages context, compaction, or other harness behaviour; those stay provider defaults or user configuration.
- `.metah/` lives only in the WorkOrder worktree and is on no branch, so a Run's Brief carries the full text of its Ticket and the Spec rather than pointers.
