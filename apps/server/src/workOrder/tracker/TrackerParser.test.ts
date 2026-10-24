import { assert, it } from "vite-plus/test";

import { parseReviewFindings, parseSpec, parseTicketGraph } from "./TrackerParser.ts";

const ticketFile = (n: number, slug: string, content: string) => ({
  fileName: `${String(n).padStart(2, "0")}-${slug}.md`,
  content,
});

it("parses a valid ticket graph and returns tickets sorted by number", () => {
  const result = parseTicketGraph([
    ticketFile(
      2,
      "later",
      `# 02: Later thing\n\n**What to build:** something.\n\n**Blocked by:** 01, #03: Setup\n\n**Status:** ready-for-agent\n\n- [ ] Works\n`,
    ),
    ticketFile(
      1,
      "first",
      `# 01: First thing\n\n**Blocked by:** None (can start immediately)\n\n**Status:** ready-for-agent\n\n- [ ] Works\n`,
    ),
    ticketFile(3, "mid", `# 03: Mid thing\n\n**Blocked by:** 01\n\n- [ ] Works\n`),
  ]);

  assert.isTrue(result.ok);
  if (result.ok) {
    assert.deepEqual(
      result.value.map((t) => t.number),
      [1, 2, 3],
    );
    assert.equal(result.value[0].slug, "first");
    assert.equal(result.value[0].title, "First thing");
    assert.deepEqual(result.value[0].blockedBy, []);
    assert.deepEqual(result.value[1].blockedBy, [1, 3]);
    assert.deepEqual(result.value[2].blockedBy, [1]);
  }
});

it("rejects an empty ticket graph", () => {
  const result = parseTicketGraph([]);
  assert.isFalse(result.ok);
});

it("rejects a ticket whose H1 number does not match the filename", () => {
  const result = parseTicketGraph([
    ticketFile(1, "thing", `# 07: Thing\n\n**Blocked by:** None\n`),
  ]);
  assert.isFalse(result.ok);
  if (!result.ok) {
    assert.isTrue(result.errors.some((e) => e.includes("01-thing.md")));
  }
});

it("rejects duplicate ticket numbers", () => {
  const result = parseTicketGraph([
    ticketFile(1, "a", `# 01: A\n\n**Blocked by:** None\n`),
    ticketFile(1, "b", `# 01: B\n\n**Blocked by:** None\n`),
  ]);
  assert.isFalse(result.ok);
  if (!result.ok) {
    assert.isTrue(result.errors.some((e) => e.toLowerCase().includes("duplicate")));
  }
});

it("rejects a ticket that fails to parse", () => {
  const result = parseTicketGraph([{ fileName: "01-thing.md", content: "no heading here" }]);
  assert.isFalse(result.ok);
});

it("rejects unresolved blockers", () => {
  const result = parseTicketGraph([ticketFile(1, "a", `# 01: A\n\n**Blocked by:** 09\n`)]);
  assert.isFalse(result.ok);
  if (!result.ok) {
    assert.isTrue(result.errors.some((e) => e.includes("09")));
  }
});

it("rejects cycles and reports the cycle path", () => {
  const result = parseTicketGraph([
    ticketFile(1, "a", `# 01: A\n\n**Blocked by:** 03\n`),
    ticketFile(2, "b", `# 02: B\n\n**Blocked by:** 01\n`),
    ticketFile(3, "c", `# 03: C\n\n**Blocked by:** 01\n`),
  ]);
  assert.isFalse(result.ok);
  if (!result.ok) {
    assert.isTrue(result.errors.some((e) => e.includes("01 → 03 → 01")));
  }
});

it("parses a spec file", () => {
  const result = parseSpec("# My spec\n\nBuild the thing.\n");
  assert.isTrue(result.ok);
  if (result.ok) {
    assert.equal(result.value.title, "My spec");
    assert.include(result.value.text, "Build the thing");
  }
});

it("rejects a missing spec file", () => {
  const result = parseSpec(undefined);
  assert.isFalse(result.ok);
  if (!result.ok) {
    assert.isTrue(result.errors[0].includes("spec.md"));
  }
});

it("rejects a spec without an H1", () => {
  const result = parseSpec("Just some text\n");
  assert.isFalse(result.ok);
});

it("rejects a spec with an empty body", () => {
  const result = parseSpec("# My spec\n\n   \n");
  assert.isFalse(result.ok);
});

it("parses review findings by axis", () => {
  const result = parseReviewFindings(
    `## Standards\n\n- No allocation in the hot loop\n- Missing tests\n\n## Spec\n\nNone\n`,
  );
  assert.isTrue(result.ok);
  if (result.ok) {
    assert.deepEqual(result.value.findings, [
      { axis: "standards", text: "No allocation in the hot loop" },
      { axis: "standards", text: "Missing tests" },
    ]);
  }
});

it("parses a review with no findings", () => {
  const result = parseReviewFindings(`## Standards\n\nNone\n\n## Spec\n\nNone\n`);
  assert.isTrue(result.ok);
  if (result.ok) {
    assert.equal(result.value.findings.length, 0);
  }
});

it("rejects a missing review file", () => {
  const result = parseReviewFindings(undefined);
  assert.isFalse(result.ok);
});

it("rejects a review missing required headings", () => {
  const result = parseReviewFindings(`## Notes\n\n- something\n`);
  assert.isFalse(result.ok);
});
