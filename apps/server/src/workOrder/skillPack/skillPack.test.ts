import { expect, test } from "vitest";

import { resolveStageBundle, resolveStageBundleFrom } from "./skillPack.ts";

const skill = (
  name: string,
  files: Record<string, string>,
): {
  name: string;
  lockHash: `hash-${string}`;
  files: Array<{ path: string; content: string }>;
} => ({
  name,
  lockHash: `hash-${name}`,
  files: Object.entries(files).map(([path, content]) => ({ path, content })),
});

test("each Stage resolves its contract root skills from the real pack", () => {
  expect(resolveStageBundle("grilling").skills.map((s) => s.name)).toEqual([
    "domain-modeling",
    "grilling",
  ]);
  expect(resolveStageBundle("spec").skills.map((s) => s.name)).toEqual(["to-spec"]);
  expect(resolveStageBundle("tickets").skills.map((s) => s.name)).toEqual(["to-tickets"]);
  expect(resolveStageBundle("review").skills.map((s) => s.name)).toEqual(["code-review"]);
});

test("run resolves tdd with its transitive skill and sibling file references", () => {
  const bundle = resolveStageBundle("run");
  expect(bundle.kind).toBe("run");
  expect(bundle.skills.map((s) => s.name)).toEqual(["codebase-design", "tdd"]);

  const tdd = bundle.skills.find((s) => s.name === "tdd");
  expect(tdd?.files.map((f) => f.path)).toEqual(["SKILL.md", "mocking.md", "tests.md"]);

  // tdd -> codebase-design (via "call the Skill tool with") -> its own docs
  const codebaseDesign = bundle.skills.find((s) => s.name === "codebase-design");
  expect(codebaseDesign?.files.map((f) => f.path)).toContain("DEEPENING.md");
  expect(codebaseDesign?.files.map((f) => f.path)).toContain("DESIGN-IT-TWICE.md");
  expect(codebaseDesign?.files.map((f) => f.path)).toContain("SKILL.md");

  // traceability: every skill carries its lock hash
  expect(tdd?.lockHash).toMatch(/^[0-9a-f]{64}$/);
});

test("grilling resolves domain-modeling's sibling format files", () => {
  const domainModeling = resolveStageBundle("grilling").skills.find(
    (s) => s.name === "domain-modeling",
  );
  expect(domainModeling?.files.map((f) => f.path)).toEqual([
    "ADR-FORMAT.md",
    "GLOSSARY-FORMAT.md",
    "SKILL.md",
  ]);
});

test("referenced files are the real pack contents", () => {
  const tdd = resolveStageBundle("run").skills.find((s) => s.name === "tdd");
  const testsFile = tdd?.files.find((f) => f.path === "tests.md");
  expect(testsFile?.content).toContain("red");
});

test("transitive sibling chains, cycles, and unknown references", () => {
  const bundle = resolveStageBundleFrom("run", [
    skill("tdd", {
      "SKILL.md":
        'Start here. Call the Skill tool with "codebase-design" and see [guide.md](guide.md) and [missing.md](missing.md).',
      "guide.md": "Continue with [../escape.md](../escape.md) and [deep.md](deep.md).",
      "deep.md":
        "Referenced via skill://ghost and `/unknown-skill`, but also see `agents/notes.md`.",
      "agents/notes.md": "leaf; loops back to [guide.md](guide.md)",
    }),
    skill("codebase-design", { "SKILL.md": 'For depth, call the Skill tool with "tdd".' }),
  ]);

  expect(bundle.skills.map((s) => s.name)).toEqual(["codebase-design", "tdd"]);
  const tdd = bundle.skills.find((s) => s.name === "tdd");
  expect(tdd?.files.map((f) => f.path)).toEqual([
    "SKILL.md",
    "agents/notes.md",
    "deep.md",
    "guide.md",
  ]);
  // unknown skills (`ghost`, `unknown-skill`) and the ../ escape are ignored
  expect(tdd?.files.find((f) => f.path === "deep.md")?.content).toContain("ghost");
  expect(bundle.skills.find((s) => s.name === "ghost")).toBeUndefined();
  expect(tdd?.files.find((f) => f.path === "guide.md")?.content).toContain("deep.md");
});

test("cycles between skills terminate", () => {
  const bundle = resolveStageBundleFrom("spec", [
    skill("to-spec", { "SKILL.md": 'Cross-check: call the Skill tool with "reviewer".' }),
    skill("reviewer", { "SKILL.md": "Send results back with skill://to-spec." }),
  ]);
  expect(bundle.skills.map((s) => s.name)).toEqual(["reviewer", "to-spec"]);
  expect(bundle.skills.every((s) => s.files.length > 0)).toBe(true);
});
