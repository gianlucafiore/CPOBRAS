import test from "node:test";
import assert from "node:assert/strict";
import {
  createRemoteInvoke,
  permissionsFor,
} from "../src/services/remote-workspace.js";
const fixture = () => ({
  remoteProject: {
    data: {
      project: { id: "same-as-own-project" },
      permissions: { price: false, resources: false },
      budgets: [
        {
          estimate: { id: "same-as-own-estimate", title: "Remoto" },
          document: {
            lines: [
              { id: "remote-line", quantity: "2", unit_cost_snapshot: "1.005" },
            ],
            sections: [],
            assignments: [],
            rates: {},
          },
          totals: { direct: "2.010", total: "2.4321" },
        },
      ],
      resources: [],
      records: [],
      parties: [],
    },
  },
  estimateId: "same-as-own-estimate",
});
test("external workspace never forwards mutations to a colliding editable local identity", async () => {
  const state = fixture(),
    calls = [];
  const invoke = createRemoteInvoke(async (c, a) => {
    calls.push([c, a]);
    return "local";
  }, state);
  for (const command of [
    "update_project",
    "add_estimate_line",
    "save_line_resources",
    "save_price_definition",
    "post_operation",
    "save_project_plan",
    "save_management_record",
    "issue_estimate",
    "create_estimate",
  ])
    await assert.rejects(
      invoke(command, {
        projectId: "same-as-own-project",
        estimateId: "same-as-own-estimate",
      }),
      /solo lectura/,
    );
  assert.equal(calls.length, 0);
  assert.equal(
    (await invoke("list_estimate_lines", { estimateId: state.estimateId }))[0]
      .total,
    "2.010",
  );
  await assert.rejects(
    invoke("get_price_definition", { estimateId: state.estimateId }),
    /no autorizó/,
  );
  await assert.rejects(
    invoke("list_project_estimates", { projectId: "another-local-project" }),
    /no pertenece/,
  );
  assert.equal(calls.length, 0);
  state.remoteProject = null;
  assert.equal(await invoke("update_project", {}), "local");
  assert.equal(calls.length, 1);
});
test("legacy snapshots retain access defaults while explicit denials remain enforced", () => {
  assert.equal(permissionsFor(fixture()).price, false);
  assert.equal(permissionsFor(fixture()).planning, true);
});
