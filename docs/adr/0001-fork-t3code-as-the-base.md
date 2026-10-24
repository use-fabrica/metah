# Fork T3 Code as metah's base

metah's GUI, session management, and multi-provider agent transport come from a one-time snapshot of pingdotgg/t3code (MIT), not from scratch and not a living fork — we do not track upstream. The workflow layer (WorkOrders, Grilling, Specs, Ticket Graphs, gated Runs) is metah-owned code added on top, kept as separable additions. We chose this to inherit a polished desktop client and multi-CLI transport on day one, accepting full ownership of the snapshot.

## Considered options

- **Build a standalone GUI on the OpenCode SDK** — rejected: months of undifferentiated GUI/transport work, when the product's value is the workflow layer.
- **Track upstream** — rejected: nightly-churn merges against a project not accepting contributions is a permanent tax we won't pay.

## Consequences

- We own the entire snapshot: when a provider CLI (Codex, Claude Code, Cursor, Grok, Antigravity) changes, metah breaks until we patch it.
- Stripping is surgical (remove only what we won't ship). The freeze permits deep reshaping, but we keep the core near-stock early to limit ownership surface.
