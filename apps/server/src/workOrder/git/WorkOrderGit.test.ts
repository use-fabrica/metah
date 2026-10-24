// @effect-diagnostics nodeBuiltinImport:off - synchronous path/fs helpers in a pure module or fixture.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { assert, describe, it } from "@effect/vitest";

import * as ServerConfig from "../../config.ts";
import * as ProcessRunner from "../../processRunner.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import * as VcsProcess from "../../vcs/VcsProcess.ts";
import * as WorkOrderGit from "./WorkOrderGit.ts";

const layerWorkOrderGit = Layer.mergeAll(WorkOrderGit.layer, GitVcsDriver.layer).pipe(
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-workorder-git-" })),
  Layer.provideMerge(VcsProcess.layer),
  Layer.provideMerge(ProcessRunner.layer.pipe(Layer.provide(NodeServices.layer))),
  Layer.provideMerge(NodeServices.layer),
);

const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const result = yield* driver.execute({
      operation: "WorkOrderGit.test.git",
      cwd,
      args,
      timeoutMs: 10_000,
    });
    return result.stdout.trim();
  });

const commitArgs = ["-c", "user.name=WorkOrderGit Test", "-c", "user.email=test@example.com"];

const commit = (cwd: string, message: string) =>
  git(cwd, [...commitArgs, "commit", "--allow-empty", "-m", message]);

const makeRepo = Effect.fn("test.makeRepo")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-workorder-git-" });
  yield* git(root, ["-c", "init.defaultBranch=main", "init"]);
  yield* commit(root, "initial");
  return root;
});

describe("WorkOrderGit", () => {
  it.effect("reports ancestor, merge-base and commit counts", () =>
    Effect.gen(function* () {
      const workOrderGit = yield* WorkOrderGit.WorkOrderGit;
      const repo = yield* makeRepo();
      yield* git(repo, ["checkout", "-b", "feature"]);
      yield* commit(repo, "feature one");
      yield* commit(repo, "feature two");

      const base = yield* workOrderGit.headSha(repo, "main");
      const tip = yield* workOrderGit.headSha(repo, "feature");
      assert.notEqual(base, tip);
      assert.equal(yield* workOrderGit.isAncestor(repo, "main", "feature"), true);
      assert.equal(yield* workOrderGit.isAncestor(repo, "feature", "main"), false);
      assert.equal(yield* workOrderGit.mergeBase(repo, "main", "feature"), base);
      assert.equal(yield* workOrderGit.commitsAhead(repo, "main", "feature"), 2);
      assert.equal(yield* workOrderGit.commitsAhead(repo, "feature", "main"), 0);
    }).pipe(Effect.provide(layerWorkOrderGit)),
  );

  it.effect("fast-forwards the integration branch onto a fresh run branch", () =>
    Effect.gen(function* () {
      const workOrderGit = yield* WorkOrderGit.WorkOrderGit;
      const repo = yield* makeRepo();
      yield* git(repo, ["checkout", "-b", "metah/spec/run-1"]);
      yield* commit(repo, "run work");
      yield* git(repo, ["checkout", "main"]);

      const runTip = yield* workOrderGit.headSha(repo, "metah/spec/run-1");
      const result = yield* workOrderGit.fastForwardIntegration({
        worktreePath: repo,
        runBranch: "metah/spec/run-1",
      });

      assert.deepEqual(result, { _tag: "landed", newTip: runTip });
      assert.equal(yield* workOrderGit.headSha(repo, "main"), runTip);
    }).pipe(Effect.provide(layerWorkOrderGit)),
  );

  it.effect("reports stale when the integration branch moved past the run branch", () =>
    Effect.gen(function* () {
      const workOrderGit = yield* WorkOrderGit.WorkOrderGit;
      const repo = yield* makeRepo();
      yield* git(repo, ["checkout", "-b", "metah/spec/run-1"]);
      yield* commit(repo, "run work");
      yield* git(repo, ["checkout", "main"]);
      yield* commit(repo, "integration landed someone else first");

      const mainTip = yield* workOrderGit.headSha(repo, "main");
      const result = yield* workOrderGit.fastForwardIntegration({
        worktreePath: repo,
        runBranch: "metah/spec/run-1",
      });

      assert.equal(result._tag, "stale");
      assert.equal(yield* workOrderGit.headSha(repo, "main"), mainTip);
    }).pipe(Effect.provide(layerWorkOrderGit)),
  );

  it.effect("fails on dirty tracked state but ignores ignored .metah contents", () =>
    Effect.gen(function* () {
      const workOrderGit = yield* WorkOrderGit.WorkOrderGit;
      const fs = yield* FileSystem.FileSystem;
      const repo = yield* makeRepo();
      yield* fs.writeFileString(NodePath.join(repo, ".gitignore"), ".metah/\n");
      yield* git(repo, ["add", ".gitignore"]);
      yield* commit(repo, "ignore .metah");
      yield* git(repo, ["checkout", "-b", "metah/spec/run-1"]);
      yield* commit(repo, "run work");
      yield* git(repo, ["checkout", "main"]);

      yield* fs.writeFileString(NodePath.join(repo, ".gitignore"), ".metah/\nchanged\n");
      const dirty = yield* Effect.exit(
        workOrderGit.fastForwardIntegration({
          worktreePath: repo,
          runBranch: "metah/spec/run-1",
        }),
      );
      assert.isTrue(Exit.isFailure(dirty));
      if (Exit.isFailure(dirty)) {
        const failure = Cause.findErrorOption(dirty.cause);
        assert.equal(Option.getOrNull(failure)?._tag, "WorkOrderGitDirtyError");
      }

      yield* git(repo, ["checkout", "--", ".gitignore"]);
      yield* fs.makeDirectory(NodePath.join(repo, ".metah"), { recursive: true });
      yield* fs.writeFileString(NodePath.join(repo, ".metah", "state.json"), "{}");

      const result = yield* workOrderGit.fastForwardIntegration({
        worktreePath: repo,
        runBranch: "metah/spec/run-1",
      });
      assert.equal(result._tag, "landed");
    }).pipe(Effect.provide(layerWorkOrderGit)),
  );

  it.effect("copies, force-resets and deletes run branches while preserving commits", () =>
    Effect.gen(function* () {
      const workOrderGit = yield* WorkOrderGit.WorkOrderGit;
      const repo = yield* makeRepo();
      yield* git(repo, ["checkout", "-b", "metah/spec/run-1"]);
      yield* commit(repo, "attempt one");
      const attemptOne = yield* workOrderGit.headSha(repo, "metah/spec/run-1");

      // Preserve the old attempt on a backup branch, then force the run branch
      // (checked out nowhere) back to main before reusing it.
      yield* workOrderGit.copyBranch(repo, "metah/spec/run-1", "metah/spec/run-1-attempt");
      yield* git(repo, ["checkout", "-b", "metah/spec/prs/a"]);
      yield* commit(repo, "prs work");
      yield* git(repo, ["checkout", "main"]);
      yield* workOrderGit.forceBranchAt(repo, "metah/spec/run-1", "main");

      assert.equal(
        yield* workOrderGit.headSha(repo, "metah/spec/run-1"),
        yield* workOrderGit.headSha(repo, "main"),
      );
      assert.equal(yield* workOrderGit.headSha(repo, "metah/spec/run-1-attempt"), attemptOne);
      assert.equal(yield* workOrderGit.commitsAhead(repo, "main", "metah/spec/run-1-attempt"), 1);

      yield* git(repo, ["branch", "metah/spec/prs/b"]);
      yield* git(repo, ["branch", "metah/spec-integration"]);

      const prefixed = yield* workOrderGit.listBranches(repo, "metah/spec/prs/");
      assert.deepEqual(prefixed.sort(), ["metah/spec/prs/a", "metah/spec/prs/b"]);

      yield* workOrderGit.deleteBranches(repo, prefixed);

      const remaining = yield* workOrderGit.listBranches(repo, "metah/");
      assert.deepEqual(remaining.sort(), [
        "metah/spec-integration",
        "metah/spec/run-1",
        "metah/spec/run-1-attempt",
      ]);
      assert.equal(yield* workOrderGit.commitsAhead(repo, "main", attemptOne), 1);
    }).pipe(Effect.provide(layerWorkOrderGit)),
  );

  it.effect("removes worktrees and reports existence", () =>
    Effect.gen(function* () {
      const workOrderGit = yield* WorkOrderGit.WorkOrderGit;
      const repo = yield* makeRepo();
      const worktreePath = NodePath.join(
        NodeOS.tmpdir(),
        `t3-workorder-git-wt-${yield* Clock.currentTimeMillis}`,
      );
      NodeFS.mkdirSync(worktreePath);
      const resolvedWorktreePath = NodeFS.realpathSync(worktreePath);
      yield* git(repo, ["worktree", "add", "-b", "metah/spec/run-2", resolvedWorktreePath, "main"]);

      assert.equal(yield* workOrderGit.worktreeExists(repo, resolvedWorktreePath), true);
      yield* workOrderGit.removeWorktree(repo, resolvedWorktreePath, { force: false });
      assert.equal(yield* workOrderGit.worktreeExists(repo, resolvedWorktreePath), false);
    }).pipe(Effect.provide(layerWorkOrderGit)),
  );
});
