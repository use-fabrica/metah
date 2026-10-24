import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { GitCommandError } from "@t3tools/contracts";

import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";

/** The WorkOrder worktree has uncommitted changes to tracked files; metah never resolves conflicts. */
export class WorkOrderGitDirtyError extends Schema.TaggedError<WorkOrderGitDirtyError>()(
  "WorkOrderGitDirtyError",
  {
    worktreePath: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Work-order worktree has dirty tracked state in ${this.worktreePath}: ${this.detail}`;
  }
}

export type FastForwardResult =
  | { readonly _tag: "landed"; readonly newTip: string }
  | { readonly _tag: "stale" };

export interface RemoveWorktreeOptions {
  readonly force: boolean;
}

export class WorkOrderGit extends Context.Service<
  WorkOrderGit,
  {
    readonly headSha: (cwd: string, ref: string) => Effect.Effect<string, GitCommandError>;
    readonly isAncestor: (
      cwd: string,
      ancestor: string,
      descendant: string,
    ) => Effect.Effect<boolean, GitCommandError>;
    readonly mergeBase: (
      cwd: string,
      a: string,
      b: string,
    ) => Effect.Effect<string, GitCommandError>;
    readonly commitsAhead: (
      cwd: string,
      base: string,
      ref: string,
    ) => Effect.Effect<number, GitCommandError>;
    readonly createBranchAt: (
      cwd: string,
      branch: string,
      startRef: string,
    ) => Effect.Effect<void, GitCommandError>;
    readonly forceBranchAt: (
      cwd: string,
      branch: string,
      startRef: string,
    ) => Effect.Effect<void, GitCommandError>;
    readonly copyBranch: (
      cwd: string,
      from: string,
      to: string,
    ) => Effect.Effect<void, GitCommandError>;
    readonly deleteBranches: (
      cwd: string,
      branches: ReadonlyArray<string>,
    ) => Effect.Effect<void, GitCommandError>;
    readonly listBranches: (
      cwd: string,
      prefix: string,
    ) => Effect.Effect<string[], GitCommandError>;
    readonly fastForwardIntegration: (input: {
      readonly worktreePath: string;
      readonly runBranch: string;
    }) => Effect.Effect<FastForwardResult, GitCommandError | WorkOrderGitDirtyError>;
    readonly removeWorktree: (
      repoRoot: string,
      path: string,
      options: RemoveWorktreeOptions,
    ) => Effect.Effect<void, GitCommandError>;
    readonly worktreeExists: (
      repoRoot: string,
      path: string,
    ) => Effect.Effect<boolean, GitCommandError>;
  }
>()("t3/workOrder/git/WorkOrderGit") {}

const commandText = (args: ReadonlyArray<string>) => ["git", ...args].join(" ");

const gitError = (operation: string, cwd: string, args: ReadonlyArray<string>, stderr: string) =>
  new GitCommandError({
    operation,
    command: commandText(args),
    cwd,
    detail: stderr.trim() === "" ? `git ${args[0]} failed.` : (stderr.trim().split("\n")[0] ?? ""),
  });

export const make = Effect.gen(function* () {
  const driver = yield* GitVcsDriver.GitVcsDriver;

  const git = (
    operation: string,
    cwd: string,
    args: ReadonlyArray<string>,
    options: { allowNonZeroExit?: boolean } = {},
  ) =>
    driver
      .execute({
        operation,
        cwd,
        args,
        timeoutMs: 30_000,
        allowNonZeroExit: true,
      })
      .pipe(
        Effect.flatMap((result) => {
          if (options.allowNonZeroExit || result.exitCode === 0) {
            return Effect.succeed(result);
          }
          return Effect.fail(gitError(operation, cwd, args, result.stderr));
        }),
      );

  const run = (operation: string, cwd: string, args: ReadonlyArray<string>) =>
    git(operation, cwd, args).pipe(Effect.asVoid);

  const stdout = (operation: string, cwd: string, args: ReadonlyArray<string>) =>
    git(operation, cwd, args).pipe(Effect.map((result) => result.stdout.trim()));

  const headSha = Effect.fn("WorkOrderGit.headSha")(function* (cwd: string, ref: string) {
    return yield* stdout("WorkOrderGit.headSha", cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
  });

  const isAncestor = Effect.fn("WorkOrderGit.isAncestor")(function* (
    cwd: string,
    ancestor: string,
    descendant: string,
  ) {
    const result = yield* git(
      "WorkOrderGit.isAncestor",
      cwd,
      ["merge-base", "--is-ancestor", "--end-of-options", ancestor, descendant],
      { allowNonZeroExit: true },
    );
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;
    return yield* Effect.fail(gitError("WorkOrderGit.isAncestor", cwd, [], result.stderr));
  });

  const mergeBase = Effect.fn("WorkOrderGit.mergeBase")(function* (
    cwd: string,
    a: string,
    b: string,
  ) {
    return yield* stdout("WorkOrderGit.mergeBase", cwd, ["merge-base", "--end-of-options", a, b]);
  });

  const commitsAhead = Effect.fn("WorkOrderGit.commitsAhead")(function* (
    cwd: string,
    base: string,
    ref: string,
  ) {
    const output = yield* stdout("WorkOrderGit.commitsAhead", cwd, [
      "rev-list",
      "--count",
      "--end-of-options",
      `${base}..${ref}`,
    ]);
    return Number(output);
  });

  const createBranchAt = Effect.fn("WorkOrderGit.createBranchAt")(function* (
    cwd: string,
    branch: string,
    startRef: string,
  ) {
    yield* run("WorkOrderGit.createBranchAt", cwd, ["branch", "--", branch, startRef]);
  });

  const forceBranchAt = Effect.fn("WorkOrderGit.forceBranchAt")(function* (
    cwd: string,
    branch: string,
    startRef: string,
  ) {
    yield* run("WorkOrderGit.forceBranchAt", cwd, ["branch", "-f", "--", branch, startRef]);
  });

  const copyBranch = Effect.fn("WorkOrderGit.copyBranch")(function* (
    cwd: string,
    from: string,
    to: string,
  ) {
    yield* run("WorkOrderGit.copyBranch", cwd, ["branch", "--", to, from]);
  });

  const deleteBranches = Effect.fn("WorkOrderGit.deleteBranches")(function* (
    cwd: string,
    branches: ReadonlyArray<string>,
  ) {
    if (branches.length === 0) return;
    yield* run("WorkOrderGit.deleteBranches", cwd, ["branch", "-D", "--", ...branches]);
  });

  const listBranches = Effect.fn("WorkOrderGit.listBranches")(function* (
    cwd: string,
    prefix: string,
  ) {
    const output = yield* stdout("WorkOrderGit.listBranches", cwd, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads/",
    ]);
    return output === "" ? [] : output.split("\n").filter((branch) => branch.startsWith(prefix));
  });

  const fastForwardIntegration = Effect.fn("WorkOrderGit.fastForwardIntegration")(
    function* (input: { worktreePath: string; runBranch: string }) {
      const status = yield* git("WorkOrderGit.fastForwardIntegration", input.worktreePath, [
        "status",
        "--porcelain",
        "--untracked-files=no",
      ]);
      if (status.stdout.trim() !== "") {
        return yield* Effect.fail(
          new WorkOrderGitDirtyError({
            worktreePath: input.worktreePath,
            detail: "Tracked files have uncommitted changes.",
          }),
        );
      }

      const ancestor = yield* isAncestor(input.worktreePath, "HEAD", input.runBranch);
      if (!ancestor) {
        return { _tag: "stale" } as const;
      }

      yield* run("WorkOrderGit.fastForwardIntegration", input.worktreePath, [
        "merge",
        "--ff-only",
        input.runBranch,
      ]);
      return {
        _tag: "landed",
        newTip: yield* headSha(input.worktreePath, "HEAD"),
      } as const;
    },
  );

  const removeWorktree = Effect.fn("WorkOrderGit.removeWorktree")(function* (
    repoRoot: string,
    path: string,
    options: RemoveWorktreeOptions,
  ) {
    yield* driver.removeWorktree({
      cwd: repoRoot,
      path,
      ...(options.force ? { force: true } : {}),
    });
  });

  const worktreeExists = Effect.fn("WorkOrderGit.worktreeExists")(function* (
    repoRoot: string,
    path: string,
  ) {
    const paths = yield* driver.listWorktreePaths(repoRoot);
    return paths.includes(path);
  });

  return {
    headSha,
    isAncestor,
    mergeBase,
    commitsAhead,
    createBranchAt,
    forceBranchAt,
    copyBranch,
    deleteBranches,
    listBranches,
    fastForwardIntegration,
    removeWorktree,
    worktreeExists,
  };
});

export const layer = Layer.effect(WorkOrderGit, make).pipe(Layer.provide(GitVcsDriver.layer));
