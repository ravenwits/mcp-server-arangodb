import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Database } from "arangojs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const collection = `mcp_smoke_${Date.now()}`;
const tempDir = await mkdtemp(join(tmpdir(), "arango-mcp-smoke-"));
const backupRoot = join(tempDir, "backups");
const arangoUrl = process.env.ARANGO_URL ?? "http://localhost:8529";
const arangoDb = process.env.ARANGO_DB ?? "_system";
const arangoUsername = process.env.ARANGO_USERNAME ?? "root";
const arangoPassword = process.env.ARANGO_PASSWORD ?? "testpass";

await mkdir(backupRoot, { recursive: true });

const transport = new StdioClientTransport({
  command: "node",
  args: ["build/index.js"],
  cwd: process.cwd(),
  stderr: "pipe",
  env: {
    ...process.env,
    ARANGO_URL: arangoUrl,
    ARANGO_DB: arangoDb,
    ARANGO_USERNAME: arangoUsername,
    ARANGO_PASSWORD: arangoPassword,
    ARANGO_BACKUP_ROOT: backupRoot,
  },
});

const stderrChunks = [];
transport.stderr?.on("data", (chunk) => stderrChunks.push(String(chunk)));

const client = new Client({ name: "arango-smoke-test", version: "1.0.0" });

async function callTool(name, args = {}) {
  return client.callTool({ name, arguments: args });
}

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, [
    "arango_backup",
    "arango_create_collection",
    "arango_drop_collection",
    "arango_insert",
    "arango_list_collections",
    "arango_query",
    "arango_remove",
    "arango_update",
  ]);
  assert.ok(
    tools.tools.every((tool) => tool.outputSchema),
    "all tools should declare outputSchema"
  );

  await callTool("arango_create_collection", { name: collection });
  await callTool("arango_insert", {
    collection,
    document: { _key: "one", value: 1, label: "first" },
  });
  await callTool("arango_insert", {
    collection,
    document: { _key: "two", value: 2, label: "second" },
  });

  const queryResult = await callTool("arango_query", {
    query: "FOR doc IN @@collection SORT doc.value RETURN doc",
    bindVars: { "@collection": collection },
    limit: 1,
  });
  assert.equal(queryResult.structuredContent.count, 1);
  assert.equal(queryResult.structuredContent.hasMore, true);
  assert.equal(queryResult.structuredContent.rows[0].label, "first");

  const backupResult = await callTool("arango_backup", {
    collection,
    outputDir: "smoke_backup",
    docLimit: 5,
  });
  assert.equal(backupResult.structuredContent.status, "completed");
  assert.equal(backupResult.structuredContent.results[0].status, "success");
  assert.equal(backupResult.structuredContent.results[0].count, 2);
  assert.ok(
    backupResult.structuredContent.outputDirectory.startsWith(backupRoot),
    "backup output must stay inside ARANGO_BACKUP_ROOT"
  );

  await assert.rejects(
    () => callTool("arango_backup", { outputDir: "/tmp/arango_backup_poc" }),
    /Invalid arguments|Backup failed/
  );

  await callTool("arango_remove", { collection, key: "one" });
  await callTool("arango_remove", { collection, key: "two" });
  await assert.rejects(
    () => callTool("arango_drop_collection", { name: collection }),
    /confirm/
  );
  const dropResult = await callTool("arango_drop_collection", {
    name: collection,
    confirm: true,
  });
  assert.equal(dropResult.structuredContent.collection.name, collection);
  assert.equal(dropResult.structuredContent.collection.dropped, true);

  console.log("ArangoDB MCP integration smoke test passed");
} catch (error) {
  const stderr = stderrChunks.join("").trim();
  if (stderr) {
    console.error(stderr);
  }
  throw error;
} finally {
  const db = new Database([arangoUrl]);
  db.useBasicAuth(arangoUsername, arangoPassword);
  await db
    .database(arangoDb)
    .collection(collection)
    .drop()
    .catch(() => undefined);
  await client.close();
  await rm(tempDir, { recursive: true, force: true });
}
