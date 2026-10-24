import {
  DOMAIN_DIR,
  REVIEW_PATH,
  SPEC_PATH,
  TICKETS_DIR,
  trackerConventionMarkdown,
} from "../tracker/index.ts";
import {
  resolveStageBundle,
  RUN_COMPLETE_SENTINEL,
  type ResolvedBundle,
  type StageBundleKind,
} from "../skillPack/skillPack.ts";

export { RUN_COMPLETE_SENTINEL };

const MERGE_RULE = `Before finishing, run \`git merge <integration-branch>\` to merge the Integration Branch tip into your branch and resolve any conflicts yourself.`;

const RUN_COMPLETE_RULE = `End your final message with the exact line \`${RUN_COMPLETE_SENTINEL}\`, and only then, when the Ticket is done and committed.`;

function bundleMarkdown(bundle: ResolvedBundle): string {
  const sections: Array<string> = [];
  for (const skill of bundle.skills) {
    sections.push(`### Skill: ${skill.name}`);
    for (const file of skill.files) {
      sections.push(`#### ${skill.name}/${file.path}\n\n\`\`\`\`\n${file.content}\`\`\`\`\n`);
    }
  }
  return sections.join("\n");
}

function briefMarkdown(options: {
  readonly stage: string;
  readonly bundle: ResolvedBundle;
  readonly payload: string;
}): string {
  return [
    `# ${options.stage} Brief`,
    "",
    "Your instructions and reference material follow. The Skill Pack sections below are the skills this Stage runs, follow them as if they were loaded as skills; you do not need to load anything yourself.",
    "",
    bundleMarkdown(options.bundle),
    trackerConventionMarkdown(),
    "## Stage instructions",
    "",
    options.payload,
  ].join("\n");
}

export const renderGrillingBrief = (i: { idea: string; domainDocsInRepo: boolean }): string => {
  const domainDocsRule = i.domainDocsInRepo
    ? "Domain docs (GLOSSARY.md, ADRs) live in this repo: write them at the repo root (`GLOSSARY.md`) and under `docs/adr/`, and commit them as the skills describe."
    : `Domain docs (GLOSSARY.md, ADRs) must NOT live in the target repo: write them under \`${DOMAIN_DIR}/\` instead (\`${DOMAIN_DIR}/GLOSSARY.md\`, \`${DOMAIN_DIR}/adr/\`) and never commit them.`;
  return briefMarkdown({
    stage: "Grilling",
    bundle: resolveStageBundle("grilling"),
    payload: [
      `The user's idea, to interrogate and sharpen:`,
      "",
      "> " + i.idea,
      "",
      domainDocsRule,
    ].join("\n"),
  });
};

export const renderSpecBrief = (): string =>
  briefMarkdown({
    stage: "Spec",
    bundle: resolveStageBundle("spec"),
    payload: [
      "Run the `to-spec` skill now to turn the grilled idea into a Spec. Write the Spec to `" +
        SPEC_PATH +
        "` using the Tracker convention above (starts with `# <title>`, followed by the to-spec body sections). The idea and everything established during grilling is earlier in this conversation.",
    ].join("\n"),
  });

export const renderTicketsBrief = (): string =>
  briefMarkdown({
    stage: "Tickets",
    bundle: resolveStageBundle("tickets"),
    payload: [
      `Run the \`to-tickets\` skill now to split the Spec into a Ticket Graph. Publish the tickets as local files under \`${TICKETS_DIR}/\` using the Tracker convention above (one file per ticket, \`<NN>-<slug>.md\`, blockers first). The Spec is at \`${SPEC_PATH}\`.`,
    ].join("\n"),
  });

export const renderRunBrief = (i: {
  ticket: { number: number; title: string; body: string };
  specText: string;
  runBranch: string;
  integrationBranch: string;
}): string =>
  briefMarkdown({
    stage: "Run",
    bundle: resolveStageBundle("run"),
    payload: [
      `Implement the Ticket below, test-first, on branch \`${i.runBranch}\`.`,
      "",
      `- Work branch: \`${i.runBranch}\``,
      `- Integration Branch: \`${i.integrationBranch}\``,
      `- ${MERGE_RULE.replace("<integration-branch>", i.integrationBranch)}`,
      "",
      "## Ticket",
      "",
      `# ${i.ticket.number}: ${i.ticket.title}`,
      "",
      i.ticket.body,
      "",
      "## Spec",
      "",
      i.specText,
      "",
      "## Completion",
      "",
      RUN_COMPLETE_RULE,
    ].join("\n"),
  });

export const renderFixRunBrief = (i: {
  findingsText: string;
  specText: string;
  runBranch: string;
  integrationBranch: string;
}): string =>
  briefMarkdown({
    stage: "Fix Run",
    bundle: resolveStageBundle("run"),
    payload: [
      `A Review found issues with the work on branch \`${i.runBranch}\`. Fix every finding below, test-first.`,
      "",
      `- Work branch: \`${i.runBranch}\``,
      `- Integration Branch: \`${i.integrationBranch}\``,
      `- ${MERGE_RULE.replace("<integration-branch>", i.integrationBranch)}`,
      "",
      "## Review findings",
      "",
      i.findingsText,
      "",
      "## Spec",
      "",
      i.specText,
      "",
      "## Completion",
      "",
      RUN_COMPLETE_RULE,
    ].join("\n"),
  });

export const renderReviewBrief = (i: {
  integrationBranch: string;
  fixedPoint: string;
  specText: string;
}): string =>
  briefMarkdown({
    stage: "Review",
    bundle: resolveStageBundle("review"),
    payload: [
      `Review the changes since the fixed point on the Integration Branch.`,
      "",
      `- Integration Branch: \`${i.integrationBranch}\``,
      `- Fixed point (merge-base): \`${i.fixedPoint}\``,
      "",
      "Write your findings to `" +
        REVIEW_PATH +
        "` in the Tracker convention's review shape: a `## Standards` heading and a `## Spec` heading, with the findings as list items under each (`None` when an axis is clean).",
      "",
      "## Spec",
      "",
      i.specText,
    ].join("\n"),
  });

export const renderUnparkMessage = (i: { question: string; verdict: string }): string =>
  [
    "You were Parked with a question. The user has answered, continue with this verdict.",
    "",
    `**Question:** ${i.question}`,
    "",
    `**Answer:** ${i.verdict}`,
  ].join("\n");

export const renderGraphChangeMessage = (i: { request: string }): string =>
  [
    "The Ticket Graph changed while you were working. Re-read the Ticket files under `" +
      TICKETS_DIR +
      "/` and pick up your Ticket's new place in the graph (new blockers, renumbering, or scope).",
    "",
    `**Change:** ${i.request}`,
  ].join("\n");

export const renderAbsorbTipMessage = (i: { integrationBranch: string }): string =>
  [
    `The Integration Branch \`${i.integrationBranch}\` advanced while your Run was in flight.`,
    "",
    `Run \`git merge ${i.integrationBranch}\` to absorb the tip into your branch, resolve any conflicts yourself, and continue the Run. ${RUN_COMPLETE_RULE}`,
  ].join("\n");

export type { ResolvedBundle, StageBundleKind };
