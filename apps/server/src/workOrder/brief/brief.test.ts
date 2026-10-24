import { expect, test } from "vitest";

import { DOMAIN_DIR, REVIEW_PATH, SPEC_PATH, TICKETS_DIR } from "../tracker/TrackerLayout.ts";
import {
  renderAbsorbTipMessage,
  renderFixRunBrief,
  renderGraphChangeMessage,
  renderGrillingBrief,
  renderReviewBrief,
  renderRunBrief,
  renderSpecBrief,
  renderTicketsBrief,
  renderUnparkMessage,
  RUN_COMPLETE_SENTINEL,
} from "./brief.ts";

const SPEC_TEXT = "# The spec\n\nDo the thing end to end.";

test("grilling brief inlines its bundle, the idea, and honours domainDocsInRepo", () => {
  const brief = renderGrillingBrief({ idea: "A clockwork orange peeler", domainDocsInRepo: false });
  expect(brief).toContain("A clockwork orange peeler");
  expect(brief).toContain("### Skill: grilling");
  expect(brief).toContain("### Skill: domain-modeling");
  expect(brief).toContain(DOMAIN_DIR);
  expect(brief).toContain("never commit");
  // every brief carries the Tracker convention
  expect(brief).toContain(SPEC_PATH);

  const inRepo = renderGrillingBrief({ idea: "x", domainDocsInRepo: true });
  expect(inRepo).toContain("docs/adr");
});

test("spec and tickets briefs point at their Tracker targets", () => {
  const spec = renderSpecBrief();
  expect(spec).toContain("### Skill: to-spec");
  expect(spec).toContain(SPEC_PATH);

  const tickets = renderTicketsBrief();
  expect(tickets).toContain("### Skill: to-tickets");
  expect(tickets).toContain(TICKETS_DIR);
});

test("run brief carries the full payload and completion rules", () => {
  const brief = renderRunBrief({
    ticket: { number: 3, title: "Add widget", body: "The widget body, in full." },
    specText: SPEC_TEXT,
    runBranch: "metah/clockwork/03-add-widget",
    integrationBranch: "metah/clockwork",
  });
  expect(brief).toContain("### Skill: tdd");
  expect(brief).toContain("metah/clockwork/03-add-widget");
  expect(brief).toContain("Integration Branch: `metah/clockwork`");
  expect(brief).toContain("git merge metah/clockwork");
  expect(brief).toContain("# 3: Add widget");
  expect(brief).toContain("The widget body, in full.");
  expect(brief).toContain(SPEC_TEXT);
  expect(brief).toContain(RUN_COMPLETE_SENTINEL);
});

test("fix run brief carries findings and the same completion rules", () => {
  const brief = renderFixRunBrief({
    findingsText: "- Missing tests for the parser",
    specText: SPEC_TEXT,
    runBranch: "metah/clockwork/03-add-widget",
    integrationBranch: "metah/clockwork",
  });
  expect(brief).toContain("### Skill: tdd");
  expect(brief).toContain("Missing tests for the parser");
  expect(brief).toContain(SPEC_TEXT);
  expect(brief).toContain("git merge metah/clockwork");
  expect(brief).toContain(RUN_COMPLETE_SENTINEL);
});

test("review brief carries fixed point, branches, and the review file shape", () => {
  const brief = renderReviewBrief({
    integrationBranch: "metah/clockwork",
    fixedPoint: "abc1234",
    specText: SPEC_TEXT,
  });
  expect(brief).toContain("### Skill: code-review");
  expect(brief).toContain("metah/clockwork");
  expect(brief).toContain("abc1234");
  expect(brief).toContain(REVIEW_PATH);
  expect(brief).toContain("## Standards");
  expect(brief).toContain("## Spec");
  expect(brief).toContain(SPEC_TEXT);
});

test("session messages render their payloads", () => {
  const unpark = renderUnparkMessage({ question: "Which database?", verdict: "Postgres" });
  expect(unpark).toContain("Which database?");
  expect(unpark).toContain("Postgres");

  const graph = renderGraphChangeMessage({ request: "Ticket 2 was blocked by 4." });
  expect(graph).toContain("Ticket 2 was blocked by 4.");
  expect(graph).toContain(TICKETS_DIR);

  const absorb = renderAbsorbTipMessage({ integrationBranch: "metah/clockwork" });
  expect(absorb).toContain("git merge metah/clockwork");
  expect(absorb).toContain(RUN_COMPLETE_SENTINEL);
});
