import * as NodePath from "node:path";

import { BUNDLED_SKILLS, type BundledSkill, type BundledSkillFile } from "./generatedSkillPack.ts";

export type StageBundleKind = "grilling" | "spec" | "tickets" | "run" | "review";

/** The exact line a Run/Fix Run ends its final message with when the Ticket is done and committed. */
export const RUN_COMPLETE_SENTINEL = "RUN COMPLETE";

const STAGE_ROOT_SKILLS: Record<StageBundleKind, ReadonlyArray<string>> = {
  grilling: ["grilling", "domain-modeling"],
  spec: ["to-spec"],
  tickets: ["to-tickets"],
  run: ["tdd"],
  review: ["code-review"],
};

export interface ResolvedBundleFile {
  readonly path: string;
  readonly content: string;
}

export interface ResolvedBundleSkill {
  readonly name: string;
  readonly lockHash: string;
  readonly files: ReadonlyArray<ResolvedBundleFile>;
}

export interface ResolvedBundle {
  readonly kind: StageBundleKind;
  readonly skills: ReadonlyArray<ResolvedBundleSkill>;
}

/**
 * Skill invocations addressed to the agent: `call the Skill tool with
 * "<name>"`, `skill://<name>`, and slash-command invocations the agent runs
 * itself ("run/call/use `/name`"). Mentions of a command as an object
 * ("…depends on the tracker `/setup-…` configured") and conditional fallbacks
 * that tell the *user* to run a setup command are not dependencies of this
 * Stage — the Brief itself provides the tracker setup.
 */
const SKILL_NAME = "[a-z0-9][a-z0-9-]*";
const SLASH_COMMAND_PATTERN = new RegExp("(?:run|call|use)\\s+`/(" + SKILL_NAME + ")`", "gi");
const SKILL_REFERENCE_PATTERNS: ReadonlyArray<RegExp> = [
  new RegExp(`call the Skill tool with ["'\`](${SKILL_NAME})["'\`]`, "gi"),
  new RegExp(`skill://(${SKILL_NAME})`, "gi"),
  SLASH_COMMAND_PATTERN,
];

const SIBLING_FILE_PATTERNS: ReadonlyArray<RegExp> = [
  // Markdown links and images: [tests.md](tests.md), [ADR-FORMAT.md](./ADR-FORMAT.md)
  /\]\(([^()\s#]+)\)/g,
  // Backticked relative file paths: `agents/openai.yaml`
  /`((?:\.\.?\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:md|markdown|txt|yaml|yml|json))`/g,
];

function extractReferencedSkillNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const pattern of SKILL_REFERENCE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const start = match.index ?? 0;
      // Skip matches that are user-facing fallback instructions ("tell the
      // user to run `/setup-…`"), not invocations this Stage performs itself.
      const context = content.slice(Math.max(0, start - 80), start + match[0].length);
      if (/tell the user to\s+(?:run|call|use)\b/i.test(context)) {
        continue;
      }
      names.add(match[1]);
    }
  }
  return names;
}

function extractReferencedSiblingPaths(content: string): Set<string> {
  const paths = new Set<string>();
  for (const pattern of SIBLING_FILE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      paths.add(match[1]);
    }
  }
  return paths;
}

/** Resolves a reference relative to the including file; `null` if it escapes the skill or is not relative. */
function resolveSiblingPath(fromFile: string, reference: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("/")) {
    return null;
  }
  const resolved = NodePath.posix.normalize(
    NodePath.posix.join(NodePath.posix.dirname(fromFile), reference),
  );
  if (resolved === ".." || resolved.startsWith("../")) {
    return null;
  }
  return resolved;
}

function resolveStageBundleFromSkills(
  kind: StageBundleKind,
  skillsByName: ReadonlyMap<string, BundledSkill>,
  rootSkillNames: ReadonlyArray<string>,
): ResolvedBundle {
  const includedFilesBySkill = new Map<string, Set<string>>();
  const skillQueue: Array<string> = [];

  const enqueueSkill = (name: string): void => {
    // Skills outside the pack are ignored; the guard also makes cycles terminate.
    if (skillsByName.has(name) && !includedFilesBySkill.has(name)) {
      includedFilesBySkill.set(name, new Set());
      skillQueue.push(name);
    }
  };
  for (const name of rootSkillNames) {
    enqueueSkill(name);
  }

  while (skillQueue.length > 0) {
    const skillName = skillQueue.shift() as string;
    const skill = skillsByName.get(skillName) as BundledSkill;
    const filesByPath = new Map<string, BundledSkillFile>(
      skill.files.map((file) => [file.path, file]),
    );
    const includedFiles = includedFilesBySkill.get(skillName) as Set<string>;
    // SKILL.md is always part of its skill's bundle.
    includedFiles.add("SKILL.md");

    const scannedFiles = new Set<string>();
    const scanFile = (file: BundledSkillFile): void => {
      for (const referencedSkill of extractReferencedSkillNames(file.content)) {
        enqueueSkill(referencedSkill);
      }
      for (const reference of extractReferencedSiblingPaths(file.content)) {
        const targetPath = resolveSiblingPath(file.path, reference);
        if (targetPath === null || !filesByPath.has(targetPath)) {
          continue;
        }
        includedFiles.add(targetPath);
        // Newly included siblings are scanned too, so chains like
        // SKILL.md -> tests.md -> further files resolve transitively.
        const target = filesByPath.get(targetPath);
        if (target !== undefined && !scannedFiles.has(targetPath)) {
          scannedFiles.add(targetPath);
          scanFile(target);
        }
      }
    };
    for (const file of skill.files) {
      if (!scannedFiles.has(file.path)) {
        scannedFiles.add(file.path);
        scanFile(file);
      }
    }
  }

  return {
    kind,
    skills: [...includedFilesBySkill.keys()].sort().map((name) => {
      const skill = skillsByName.get(name) as BundledSkill;
      const includedFiles = includedFilesBySkill.get(name) as Set<string>;
      return {
        name,
        lockHash: skill.lockHash,
        files: skill.files
          .filter((file) => includedFiles.has(file.path))
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
          .map((file) => ({ path: file.path, content: file.content })),
      };
    }),
  };
}

/**
 * Transitively resolves the Skill Pack for a Stage: the Stage's root skills,
 * every skill they reference, and every sibling file referenced from an
 * included file's markdown, themselves scanned transitively. Deduped,
 * deterministic order (skills sorted by name, files by path), cycle-safe.
 * References to skills or files that are not in the pack are ignored.
 */
export const resolveStageBundleFrom = (
  kind: StageBundleKind,
  skills: ReadonlyArray<BundledSkill>,
): ResolvedBundle =>
  resolveStageBundleFromSkills(
    kind,
    new Map(skills.map((skill) => [skill.name, skill])),
    STAGE_ROOT_SKILLS[kind],
  );

export const resolveStageBundle = (kind: StageBundleKind): ResolvedBundle =>
  resolveStageBundleFrom(kind, BUNDLED_SKILLS);
