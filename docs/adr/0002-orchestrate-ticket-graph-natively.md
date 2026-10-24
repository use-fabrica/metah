# Orchestrate the Ticket Graph natively, not through an implement-spec Session

metah's server orchestrates execution itself: each Frontier Ticket becomes a gated Run in its own Session and worktree off the Integration Branch, merged back on completion, with the Frontier advancing as Runs land. We do not run one Session executing the implement-spec skill and letting it spawn its own subagents, because that hides Runs from the board and makes per-Ticket gates and Autopilot impossible. The implement-spec skill's steps (integration branch, per-Ticket worktrees, merge discipline, Frontier advance, review tail) become metah server logic; the workflow layer lives server-side in the t3code snapshot, beside its event-sourced orchestration.

## Considered options

- **One wrapper Session running implement-spec**: rejected; the agent's subagents are invisible to metah, so the Ticket Graph board would be a guess.
