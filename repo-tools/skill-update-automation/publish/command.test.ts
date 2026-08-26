import assert from "node:assert/strict";
import test from "node:test";

import { permissionFailureOutput } from "./command.ts";
import { GithubHostPermissionError } from "./production-adapter.ts";

test("publish command emits exact permission evidence before failing the step", () => {
  assert.equal(permissionFailureOutput(new GithubHostPermissionError(
    "denied",
    "update-pull-request",
    "unknown",
  )), [
    "failure-state=permission-denied",
    "permission-operation=update-pull-request",
    "permission-post-state=unknown",
    "",
  ].join("\n"));
  assert.equal(permissionFailureOutput(new Error("other")), null);
});
