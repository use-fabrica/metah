export const TRACKER_DIR = ".metah";
export const TRACKER_GITIGNORE = "*\n";
export const SPEC_PATH = ".metah/spec.md";
export const TICKETS_DIR = ".metah/tickets";
export const REVIEW_PATH = ".metah/review.md";
export const DOMAIN_DIR = ".metah/domain";

const TICKET_TEMPLATE = `# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** <comma-separated ticket numbers, optionally \`#NN: title\`> or \`None (can start immediately)\`.

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
`;

const REVIEW_TEMPLATE = `## Standards

- <finding, or \`None\`>

## Spec

- <finding, or \`None\`>
`;

/**
 * The Tracker convention instructions included in every Brief: the `.metah/`
 * layout, the Spec file, the per-Ticket file template, the Review file shape,
 * and the fact that `.metah/` is the configured issue tracker (so skills never
 * ask the user to run setup). Must stay in sync with TrackerParser.ts.
 */
export const trackerConventionMarkdown = (): string => `## Tracker convention

The issue tracker for this WorkOrder is the local \`${TRACKER_DIR}/\` directory in the repo, it is already configured; never ask the user to set up a tracker. It is fully gitignored (everything inside is ignored).

Layout:

- Spec: \`${SPEC_PATH}\`: starts with \`# <title>\` followed by the spec body.
- Tickets: \`${TICKETS_DIR}/<NN>-<slug>.md\`: one file per ticket, numbered from \`01\` in dependency order (blockers first). Each file:

\`\`\`markdown
${TICKET_TEMPLATE}\`\`\`

  The \`NN\` in the heading must match the number in the filename. \`**Blocked by:**\` lists the ticket numbers gating this one (e.g. \`1, #03: Setup\`), or \`None (can start immediately)\`.
- Review: \`${REVIEW_PATH}\`: the code review output after a Review, exactly:

\`\`\`markdown
${REVIEW_TEMPLATE}\`\`\`

  Findings are the list items under each heading; \`None\` means no findings on that axis.
- Domain docs (when instructed): \`${DOMAIN_DIR}/\` for GLOSSARY.md and ADRs when they must not live in the target repo.

When publishing tickets with the \`to-tickets\` skill, use this local-files layout (the per-ticket template above) instead of an external tracker. Keep every file in exactly these shapes, Gates parse them and refuse to proceed if they do not parse.
`;
