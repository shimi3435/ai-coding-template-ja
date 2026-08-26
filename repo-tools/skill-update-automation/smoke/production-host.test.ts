import assert from "node:assert/strict";
import test from "node:test";

import { buildSmokeHostEnvironment, ProductionSmokeHost, type SmokeHostCommandRunner } from "./production-host.ts";
import { createPresentResourceState } from "../model/index.ts";
import type { SmokePreview, SmokeTarget } from "../model/index.ts";
import { buildSmokePreview, smokePullRequestBody } from "./command.ts";
import { executeSmokePlan } from "./command.ts";
import { FakeSmokeHost } from "./fake-host.ts";

function primaryTarget(preview: SmokePreview, index: number): SmokeTarget {
  const step = preview.steps[index]!;
  const before = step.before.find((item) => item.resource.key === step.primaryKey)!;
  const after = step.after.find((item) => item.resource.key === step.primaryKey)!;
  return { operation: step.operation, resource: before.resource, before: before.state, after: after.state };
}

test("production host forwards only allowlisted noncredential environment to gh", () => {
  assert.deepEqual(buildSmokeHostEnvironment({
    PATH: "/usr/bin",
    HOME: "/home/operator",
    XDG_CONFIG_HOME: "/home/operator/.config",
    GH_CONFIG_DIR: "/home/operator/.config/gh",
    LANG: "C.UTF-8",
    HTTPS_PROXY: "http://proxy.example",
    SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
    GH_TOKEN: "gh-secret",
    GITHUB_TOKEN: "github-secret",
    GH_ENTERPRISE_TOKEN: "enterprise-secret",
    GITHUB_ENTERPRISE_TOKEN: "github-enterprise-secret",
    GH_HOST: "unapproved.example",
    UNRELATED_SECRET: "secret",
  }), {
    PATH: "/usr/bin",
    HOME: "/home/operator",
    XDG_CONFIG_HOME: "/home/operator/.config",
    GH_CONFIG_DIR: "/home/operator/.config/gh",
    LANG: "C.UTF-8",
    SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
  });
});

test("production host reads repository and workflow run through existing gh auth", async () => {
  const transcript: string[][] = [];
  const runner: SmokeHostCommandRunner = (_command, args) => {
    transcript.push([...args]);
    const endpoint = args.at(-1);
    if (endpoint === "repos/owner/repo") {
      return { exitCode: 0, stdout: JSON.stringify({ id: 123, full_name: "owner/repo", default_branch: "main" }), stderr: "" };
    }
    if (endpoint === "repos/owner/repo/actions/runs/456") {
      return { exitCode: 0, stdout: JSON.stringify({
        id: 456,
        run_attempt: 2,
        head_sha: "a".repeat(40),
        repository: { id: 123, full_name: "owner/repo" },
      }), stderr: "" };
    }
    if (endpoint === `repos/owner/repo/commits/${"a".repeat(40)}`) {
      return { exitCode: 0, stdout: JSON.stringify({ parents: [{ sha: "b".repeat(40) }] }), stderr: "" };
    }
    if (endpoint === `repos/owner/repo/compare/${"c".repeat(40)}...${"b".repeat(40)}`) {
      return { exitCode: 0, stdout: JSON.stringify({ status: "ahead", ahead_by: 1, behind_by: 0 }), stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected request" };
  };
  const host = new ProductionSmokeHost({ repository: "owner/repo", runner });

  assert.deepEqual(await host.readRepository(), {
    id: "123",
    fullName: "owner/repo",
    defaultBranchRef: "refs/heads/main",
  });
  assert.deepEqual(await host.readWorkflowRun("456"), {
    id: "456",
    attempt: 2,
    repositoryId: "123",
    repository: "owner/repo",
    headSha: "a".repeat(40),
  });
  assert.equal(await host.readCommitParent("a".repeat(40)), "b".repeat(40));
  assert.deepEqual(await host.readCommitComparison("c".repeat(40), "b".repeat(40)), {
    status: "ahead", aheadBy: 1, behindBy: 0,
  });
  assert.deepEqual(transcript, [
    ["api", "--method", "GET", "repos/owner/repo"],
    ["api", "--method", "GET", "repos/owner/repo/actions/runs/456"],
    ["api", "--method", "GET", `repos/owner/repo/commits/${"a".repeat(40)}`],
    ["api", "--method", "GET", `repos/owner/repo/compare/${"c".repeat(40)}...${"b".repeat(40)}`],
  ]);
});

test("production host creates the planned branch and draft PR with exact post-state", async () => {
  const sourceCommit = "a".repeat(40);
  const fake = new FakeSmokeHost({
    repository: { id: "123", fullName: "owner/repo", defaultBranchRef: "refs/heads/main" },
    workflowRuns: [{ id: "456", attempt: 2, repositoryId: "123", repository: "owner/repo", headSha: sourceCommit }],
  });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, fake);
  const branchTarget = primaryTarget(preview, 0);
  const prTarget = primaryTarget(preview, 1);
  const writes: Readonly<{ args: readonly string[]; input?: string }>[] = [];
  const runner: SmokeHostCommandRunner = (_command, args, options) => {
    writes.push({ args: [...args], ...(options?.input === undefined ? {} : { input: options.input }) });
    const endpoint = args.at(-1);
    if (endpoint === "repos/owner/repo/git/refs") {
      return { exitCode: 0, stderr: "", stdout: JSON.stringify({
        ref: "refs/heads/automation/skill-updates/g999999",
        object: { sha: "b".repeat(40) },
      }) };
    }
    if (endpoint === "repos/owner/repo/pulls") {
      return { exitCode: 0, stderr: "", stdout: JSON.stringify({
        number: 9, state: "open", draft: true, merged: false,
        body: smokePullRequestBody({
          repositoryId: "123", repository: "owner/repo",
          run: { workflowRunId: "456", workflowRunAttempt: 2 },
          headRef: "refs/heads/automation/skill-updates/g999999", baseRef: "refs/heads/main",
          validationBaseSha: "b".repeat(40), sourceCommit,
        }, "initial"),
        head: { repo: { id: 123 }, ref: "automation/skill-updates/g999999", sha: "b".repeat(40) },
        base: { repo: { id: 123 }, ref: "main" },
      }) };
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected request" };
  };
  const host = new ProductionSmokeHost({ repository: "owner/repo", runner });

  assert.deepEqual((await host.applyTarget(branchTarget, new Map(), preview)).state, branchTarget.after);
  const createdPr = await host.applyTarget(prTarget, new Map(), preview);
  assert.equal(createdPr.number, 9);
  assert.deepEqual(createdPr.state, prTarget.after);
  assert.equal(JSON.parse(writes[0]!.input!).ref, "refs/heads/automation/skill-updates/g999999");
  assert.equal(JSON.parse(writes[1]!.input!).draft, true);
});

test("production preview discovers planned branch, PR, and issue absence read-only", async () => {
  const sourceCommit = "a".repeat(40);
  const runner: SmokeHostCommandRunner = (_command, args) => {
    const endpoint = args.at(-1);
    if (endpoint === "repos/owner/repo") {
      return { exitCode: 0, stdout: JSON.stringify({ id: 123, full_name: "owner/repo", default_branch: "main" }), stderr: "" };
    }
    if (endpoint === "repos/owner/repo/actions/runs/456") {
      return { exitCode: 0, stdout: JSON.stringify({ id: 456, run_attempt: 2, head_sha: sourceCommit,
        repository: { id: 123, full_name: "owner/repo" } }), stderr: "" };
    }
    if (endpoint === `repos/owner/repo/commits/${sourceCommit}`) {
      return { exitCode: 0, stdout: JSON.stringify({ parents: [{ sha: "b".repeat(40) }] }), stderr: "" };
    }
    if (endpoint === "repos/owner/repo/git/ref/heads/main") {
      return { exitCode: 0, stdout: JSON.stringify({ ref: "refs/heads/main", object: { sha: "c".repeat(40) } }), stderr: "" };
    }
    if (endpoint === `repos/owner/repo/compare/${"c".repeat(40)}...${"b".repeat(40)}`) {
      return { exitCode: 0, stdout: JSON.stringify({ status: "ahead", ahead_by: 1, behind_by: 0 }), stderr: "" };
    }
    if (endpoint === "repos/owner/repo/git/ref/heads/automation/skill-updates/g999999") {
      return { exitCode: 1, stdout: "", stderr: "HTTP 404: Not Found" };
    }
    if (endpoint === "repos/owner/repo/pulls?state=all&per_page=100" ||
      endpoint === "repos/owner/repo/issues?state=all&per_page=100") {
      return { exitCode: 0, stdout: "[[]]", stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: `unexpected request: ${endpoint}` };
  };

  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, new ProductionSmokeHost({ repository: "owner/repo", runner }));

  assert.equal(preview.steps.length, 14);
});

test("production host normalizes existing PR and issue from their exact numbers", async () => {
  const runner: SmokeHostCommandRunner = (_command, args) => {
    const endpoint = args.at(-1);
    if (endpoint === "repos/owner/repo/pulls/7") {
      return { exitCode: 0, stderr: "", stdout: JSON.stringify({
        number: 7,
        state: "closed",
        draft: false,
        merged: true,
        body: "pr body",
        head: { repo: { id: 123 }, ref: "topic", sha: "a".repeat(40) },
        base: { repo: { id: 123 }, ref: "main" },
      }) };
    }
    if (endpoint === "repos/owner/repo/issues/8") {
      return { exitCode: 0, stderr: "", stdout: JSON.stringify({
        number: 8,
        state: "open",
        title: "Skill update automation requires attention",
        body: "issue body",
      }) };
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected request" };
  };
  const host = new ProductionSmokeHost({ repository: "owner/repo", runner });

  const pr = await host.readResource({
    kind: "pull-request",
    key: "existing-pr",
    locator: { mode: "existing", number: 7 },
  }, new Map());
  const issue = await host.readResource({
    kind: "issue",
    key: "existing-issue",
    locator: { mode: "existing", number: 8 },
  }, new Map());

  assert.equal(pr.number, 7);
  assert.deepEqual(pr.state, createPresentResourceState({
    schemaVersion: 1,
    kind: "pull-request-state",
    headRepositoryId: "123",
    headRef: "refs/heads/topic",
    headSha: "a".repeat(40),
    baseRepositoryId: "123",
    baseRef: "refs/heads/main",
    draft: false,
    state: "closed",
    merged: true,
    bodyDigest: "sha256:58899116426566a04e000e48b23b5817e4c327874d5a9a922929f52c5c81f822",
  }));
  assert.equal(issue.number, 8);
  assert.equal(issue.state.state, "present");
  if (issue.state.state === "present") assert.equal(issue.state.value.kind, "issue-state");
});

test("production host rejects a PR response without an exact merged flag", async () => {
  const runner: SmokeHostCommandRunner = () => ({
    exitCode: 0,
    stderr: "",
    stdout: JSON.stringify({
      number: 7, state: "closed", draft: false, body: "pr body",
      head: { repo: { id: 123 }, ref: "topic", sha: "a".repeat(40) },
      base: { repo: { id: 123 }, ref: "main" },
    }),
  });
  const host = new ProductionSmokeHost({ repository: "owner/repo", runner });

  await assert.rejects(() => host.readResource({
    kind: "pull-request",
    key: "existing-pr",
    locator: { mode: "existing", number: 7 },
  }, new Map()), /merged/);
});

test("production adapter completes the immutable lifecycle against an offline host transcript", async () => {
  const sourceCommit = "a".repeat(40);
  let branch: null | { ref: string; sha: string } = null;
  let pr: null | Record<string, unknown> = null;
  let issue: null | Record<string, unknown> = null;
  const ok = (value: unknown = ""): ReturnType<SmokeHostCommandRunner> => ({
    exitCode: 0,
    stderr: "",
    stdout: typeof value === "string" ? value : JSON.stringify(value),
  });
  const notFound = (): ReturnType<SmokeHostCommandRunner> => ({ exitCode: 1, stdout: "", stderr: "HTTP 404: Not Found" });
  const runner: SmokeHostCommandRunner = (_command, args, options) => {
    if (args[0] === "pr" && args[1] === "ready") {
      assert.ok(pr !== null);
      pr.draft = args.includes("--undo");
      return ok();
    }
    const method = args[args.indexOf("--method") + 1];
    const endpoint = args.at(-1);
    const input = options?.input === undefined ? {} : JSON.parse(options.input) as Record<string, unknown>;
    if (endpoint === "repos/owner/repo") return ok({ id: 123, full_name: "owner/repo", default_branch: "main" });
    if (endpoint === "repos/owner/repo/actions/runs/456") return ok({
      id: 456, run_attempt: 2, head_sha: sourceCommit, repository: { id: 123, full_name: "owner/repo" },
    });
    if (endpoint === `repos/owner/repo/commits/${sourceCommit}`) {
      return ok({ parents: [{ sha: "b".repeat(40) }] });
    }
    if (endpoint === "repos/owner/repo/git/ref/heads/main") {
      return ok({ ref: "refs/heads/main", object: { sha: "c".repeat(40) } });
    }
    if (endpoint === `repos/owner/repo/compare/${"c".repeat(40)}...${"b".repeat(40)}`) {
      return ok({ status: "ahead", ahead_by: 1, behind_by: 0 });
    }
    if (endpoint === "repos/owner/repo/pulls?state=all&per_page=100") return ok([pr === null ? [] : [pr]]);
    if (endpoint === "repos/owner/repo/issues?state=all&per_page=100") return ok([issue === null ? [] : [issue]]);
    if (endpoint?.includes("/git/ref/heads/automation/skill-updates/g999999")) {
      return branch === null ? notFound() : ok({ ref: branch.ref, object: { sha: branch.sha } });
    }
    if (endpoint === "repos/owner/repo/git/refs" && method === "POST") {
      branch = { ref: String(input.ref), sha: String(input.sha) };
      return ok({ ref: branch.ref, object: { sha: branch.sha } });
    }
    if (endpoint?.includes("/git/refs/heads/automation/skill-updates/g999999") && method === "PATCH") {
      assert.ok(branch !== null);
      branch.sha = String(input.sha);
      if (pr !== null) {
        const head = pr.head as Record<string, unknown>;
        head.sha = branch.sha;
      }
      return ok({ ref: branch.ref, object: { sha: branch.sha } });
    }
    if (endpoint?.includes("/git/refs/heads/automation/skill-updates/g999999") && method === "DELETE") {
      branch = null;
      return ok();
    }
    if (endpoint === "repos/owner/repo/pulls" && method === "POST") {
      pr = {
        number: 1, state: "open", draft: true, merged: false, body: input.body,
        head: { repo: { id: 123 }, ref: input.head, sha: branch?.sha },
        base: { repo: { id: 123 }, ref: input.base },
      };
      return ok(pr);
    }
    if (endpoint === "repos/owner/repo/pulls/1" && method === "GET") return pr === null ? notFound() : ok(pr);
    if (endpoint === "repos/owner/repo/pulls/1" && method === "PATCH") {
      assert.ok(pr !== null);
      Object.assign(pr, input);
      return ok(pr);
    }
    if (endpoint === "repos/owner/repo/issues" && method === "POST") {
      issue = { number: 2, state: "open", title: input.title, body: input.body };
      return ok(issue);
    }
    if (endpoint === "repos/owner/repo/issues/2" && method === "GET") return issue === null ? notFound() : ok(issue);
    if (endpoint === "repos/owner/repo/issues/2" && method === "PATCH") {
      assert.ok(issue !== null);
      Object.assign(issue, input);
      return ok(issue);
    }
    return { exitCode: 1, stdout: "", stderr: `unexpected request: ${method} ${endpoint}` };
  };
  const host = new ProductionSmokeHost({ repository: "owner/repo", runner });
  const preview = await buildSmokePreview({
    repository: "owner/repo",
    run: { workflowRunId: "456", workflowRunAttempt: 2 },
    sourceCommit,
    createdAt: "2026-08-20T01:02:03.004Z",
  }, host);

  const evidence = await executeSmokePlan(preview, host);

  assert.equal(evidence.steps.length, 14);
  assert.deepEqual(evidence.checkpoints.map((checkpoint) => checkpoint.kind), [
    "draft", "validation-failure", "append", "human-intervention", "ready",
    "pause", "resume", "issue-dedupe", "cleanup",
  ]);
  assert.equal(branch, null);
  assert.equal((pr as unknown as Record<string, unknown>).state, "closed");
  assert.equal((issue as unknown as Record<string, unknown>).state, "closed");
});
