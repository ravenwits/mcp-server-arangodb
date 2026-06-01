import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Database } from "arangojs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const collection = `mcp_smoke_${Date.now()}`;
const edgeCollection = `${collection}_edges`;
const graph = `${collection}_graph`;
const searchView = `${collection}_view`;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, [
    "arango_backup",
    "arango_bulk_insert",
    "arango_bulk_update",
    "arango_count_documents",
    "arango_create_analyzer",
    "arango_create_collection",
    "arango_create_graph",
    "arango_create_index",
    "arango_create_search_view",
    "arango_describe_database",
    "arango_drop_collection",
    "arango_explain_query",
    "arango_get_collection",
    "arango_get_document",
    "arango_insert",
    "arango_insert_edge",
    "arango_list_analyzers",
    "arango_list_collections",
    "arango_list_documents",
    "arango_list_graphs",
    "arango_list_indexes",
    "arango_list_views",
    "arango_query",
    "arango_read_query",
    "arango_remove",
    "arango_sample_documents",
    "arango_search",
    "arango_shortest_path",
    "arango_traverse",
    "arango_update",
    "arango_validate_query",
  ]);
  assert.ok(
    tools.tools.every((tool) => tool.outputSchema),
    "all tools should declare outputSchema"
  );

  await callTool("arango_create_collection", { name: collection });
  await callTool("arango_create_collection", { name: edgeCollection, type: "edge" });
  await callTool("arango_insert", {
    collection,
    document: { _key: "one", value: 1, label: "first" },
  });
  await callTool("arango_insert", {
    collection,
    document: { _key: "two", value: 2, label: "second" },
  });
  const bulkInsertResult = await callTool("arango_bulk_insert", {
    collection,
    documents: [
      { _key: "three", value: 3, label: "third" },
      { _key: "four", value: 4, label: "fourth" },
    ],
  });
  assert.equal(bulkInsertResult.structuredContent.count, 2);
  assert.equal(bulkInsertResult.structuredContent.errorCount, 0);
  const bulkUpdateResult = await callTool("arango_bulk_update", {
    collection,
    documents: [
      { _key: "three", label: "third-updated" },
      { _key: "four", label: "fourth-updated" },
    ],
  });
  assert.equal(bulkUpdateResult.structuredContent.count, 2);
  assert.equal(bulkUpdateResult.structuredContent.errorCount, 0);

  const validateResult = await callTool("arango_validate_query", {
    query: "FOR doc IN @@collection RETURN doc",
  });
  assert.equal(validateResult.structuredContent.validation.parsed, true);

  const queryResult = await callTool("arango_query", {
    query: "FOR doc IN @@collection SORT doc.value RETURN doc",
    bindVars: { "@collection": collection },
    limit: 1,
  });
  assert.equal(queryResult.structuredContent.count, 1);
  assert.equal(queryResult.structuredContent.hasMore, true);
  assert.equal(queryResult.structuredContent.rows[0].label, "first");

  const readQueryResult = await callTool("arango_read_query", {
    query: "FOR doc IN @@collection SORT doc.value RETURN doc",
    bindVars: { "@collection": collection },
    limit: 2,
    failOnWarning: true,
  });
  assert.equal(readQueryResult.structuredContent.count, 2);
  await assert.rejects(
    () =>
      callTool("arango_read_query", {
        query: "INSERT { value: 3 } INTO @@collection",
        bindVars: { "@collection": collection },
      }),
    /Read-only query rejected/
  );

  const getDocumentResult = await callTool("arango_get_document", {
    collection,
    key: "one",
  });
  assert.equal(getDocumentResult.structuredContent.document.label, "first");

  const listDocumentsResult = await callTool("arango_list_documents", {
    collection,
    limit: 1,
  });
  assert.equal(listDocumentsResult.structuredContent.count, 1);
  assert.equal(listDocumentsResult.structuredContent.hasMore, true);

  const countResult = await callTool("arango_count_documents", { collection });
  assert.equal(countResult.structuredContent.count, 4);

  const sampleResult = await callTool("arango_sample_documents", { collection, limit: 1 });
  assert.equal(sampleResult.structuredContent.count, 1);

  const collectionResult = await callTool("arango_get_collection", { collection });
  assert.equal(collectionResult.structuredContent.collection.name, collection);

  const describeResult = await callTool("arango_describe_database");
  assert.ok(
    describeResult.structuredContent.collections.some((item) => item.name === collection)
  );

  const indexResult = await callTool("arango_create_index", {
    collection,
    type: "persistent",
    fields: ["value"],
    name: `${collection}_value_idx`,
  });
  assert.equal(indexResult.structuredContent.index.type, "persistent");
  const indexesResult = await callTool("arango_list_indexes", { collection });
  assert.ok(indexesResult.structuredContent.indexes.length >= 2);

  const explainResult = await callTool("arango_explain_query", {
    query: "FOR doc IN @@collection FILTER doc.value == @value RETURN doc",
    bindVars: { "@collection": collection, value: 1 },
  });
  assert.ok(explainResult.structuredContent.explanation.plan);

  const analyzersResult = await callTool("arango_list_analyzers");
  assert.ok(Array.isArray(analyzersResult.structuredContent.analyzers));
  const viewsResult = await callTool("arango_list_views");
  assert.ok(Array.isArray(viewsResult.structuredContent.views));
  await callTool("arango_create_search_view", {
    name: searchView,
    collection,
    includeAllFields: true,
    analyzers: ["identity"],
  });
  let searchResult;
  for (let attempt = 0; attempt < 10; attempt++) {
    searchResult = await callTool("arango_search", {
      view: searchView,
      field: "label",
      searchText: "first",
      analyzer: "identity",
    });
    if (searchResult.structuredContent.count > 0) break;
    await sleep(1000);
  }
  assert.equal(searchResult.structuredContent.rows[0].document.label, "first");

  const graphsResult = await callTool("arango_list_graphs");
  assert.ok(Array.isArray(graphsResult.structuredContent.graphs));

  const edgeResult = await callTool("arango_insert_edge", {
    collection: edgeCollection,
    from: `${collection}/one`,
    to: `${collection}/two`,
    document: { label: "connects" },
  });
  assert.ok(edgeResult.structuredContent.document._key);

  const traverseResult = await callTool("arango_traverse", {
    startVertex: `${collection}/one`,
    edgeCollection,
    direction: "OUTBOUND",
    maxDepth: 1,
  });
  assert.equal(traverseResult.structuredContent.count, 1);

  const pathResult = await callTool("arango_shortest_path", {
    startVertex: `${collection}/one`,
    targetVertex: `${collection}/two`,
    edgeCollection,
  });
  assert.ok(pathResult.structuredContent.count >= 1);

  const graphResult = await callTool("arango_create_graph", {
    name: graph,
    edgeCollection,
    fromCollections: [collection],
    toCollections: [collection],
  });
  assert.equal(graphResult.structuredContent.graph.name, graph);
  const namedTraverseResult = await callTool("arango_traverse", {
    startVertex: `${collection}/one`,
    graph,
    direction: "OUTBOUND",
    maxDepth: 1,
    order: "bfs",
    uniqueVertices: "path",
  });
  assert.equal(namedTraverseResult.structuredContent.count, 1);
  const namedPathResult = await callTool("arango_shortest_path", {
    startVertex: `${collection}/one`,
    targetVertex: `${collection}/two`,
    graph,
  });
  assert.ok(namedPathResult.structuredContent.count >= 1);
  const cleanupDb = new Database([arangoUrl]);
  cleanupDb.useBasicAuth(arangoUsername, arangoPassword);
  await cleanupDb.database(arangoDb).graph(graph).drop(false);

  const backupResult = await callTool("arango_backup", {
    collection,
    outputDir: "smoke_backup",
    docLimit: 5,
  });
  assert.equal(backupResult.structuredContent.status, "completed");
  assert.equal(backupResult.structuredContent.results[0].status, "success");
  assert.equal(backupResult.structuredContent.results[0].count, 4);
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
    .view(searchView)
    .drop()
    .catch(() => undefined);
  await db
    .database(arangoDb)
    .graph(graph)
    .drop(false)
    .catch(() => undefined);
  await db
    .database(arangoDb)
    .collection(edgeCollection)
    .drop()
    .catch(() => undefined);
  await db
    .database(arangoDb)
    .collection(collection)
    .drop()
    .catch(() => undefined);
  await client.close();
  await rm(tempDir, { recursive: true, force: true });
}
