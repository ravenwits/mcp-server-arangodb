import {
  CallToolResult,
  ErrorCode,
  McpError,
  Request,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Database } from "arangojs";
import {
  CollectionStatus,
  CollectionType,
  CreateCollectionOptions,
} from "arangojs/collections";
import { promises as fs } from "fs";
import { join } from "path";
import { ZodError, ZodType } from "zod";
import { getBackupRoot, resolveBackupOutputDir } from "./backupPaths.js";
import { API_TOOLS } from "./tools.js";
import {
  backupArgsSchema,
  bulkInsertArgsSchema,
  bulkUpdateArgsSchema,
  collectionArgsSchema,
  collectionDocumentArgsSchema,
  collectionKeyArgsSchema,
  createAnalyzerArgsSchema,
  createCollectionArgsSchema,
  createGraphArgsSchema,
  createIndexArgsSchema,
  createSearchViewArgsSchema,
  dropCollectionArgsSchema,
  explainQueryArgsSchema,
  insertEdgeArgsSchema,
  listDocumentsArgsSchema,
  queryArgsSchema,
  readQueryArgsSchema,
  sampleDocumentsArgsSchema,
  searchArgsSchema,
  shortestPathArgsSchema,
  traverseArgsSchema,
  updateDocumentArgsSchema,
  validateQueryArgsSchema,
} from "./types.js";

const PARALLEL_BACKUP_CHUNKS = 5;
const WRITE_AQL_PATTERN = /\b(INSERT|UPDATE|REPLACE|REMOVE|UPSERT|DROP|CREATE|ALTER|TRUNCATE)\b/i;
const FIELD_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function toToolResponse(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function parseArgs<T>(schema: ZodType<T>, args: unknown, toolName: string): T {
  try {
    return schema.parse(args ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
        .join("; ");
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid arguments for ${toolName}: ${issues}. Check the tool schema and retry with valid values.`
      );
    }
    throw error;
  }
}

async function readCursorRows<T>(
  cursor: { next(): Promise<T | undefined>; hasNext: boolean },
  limit: number
): Promise<{ rows: T[]; hasMore: boolean }> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const row = await cursor.next();
    if (row === undefined) break;
    rows.push(row);
  }

  return { rows, hasMore: cursor.hasNext };
}

function assertReadOnlyAql(query: string): void {
  if (WRITE_AQL_PATTERN.test(query)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Read-only query rejected because it contains an AQL write or DDL keyword. Use arango_query only when writes are intentional."
    );
  }
}

function assertFieldPath(field: string): void {
  if (!FIELD_PATH_PATTERN.test(field)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Invalid field path. Use dot-separated identifier paths like name or profile.email."
    );
  }
}

function quoteAqlIdentifier(identifier: string): string {
  return `\`${identifier}\``;
}

async function runBoundedQuery(
  db: Database,
  query: string,
  bindVars: Record<string, unknown>,
  limit: number,
  options: { memoryLimit?: number; maxRuntime?: number; failOnWarning?: boolean } = {}
) {
  const cursor = await db.query<unknown>(query, bindVars, {
    batchSize: limit,
    count: true,
    ...options,
  });
  const { rows, hasMore } = await readCursorRows(cursor, limit);
  return { rows, count: rows.length, totalCount: cursor.count, hasMore, limit };
}

function countOperationFailures(results: unknown[]): number {
  return results.filter(
    (result) =>
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      (result as { error?: unknown }).error === true
  ).length;
}

function getGraphSource(args: { edgeCollection?: string; graph?: string }): string {
  if (args.graph && args.edgeCollection) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Provide either graph or edgeCollection, not both."
    );
  }
  if (args.graph) return `GRAPH ${JSON.stringify(args.graph)}`;
  if (args.edgeCollection) return quoteAqlIdentifier(args.edgeCollection);
  throw new McpError(ErrorCode.InvalidRequest, "Provide graph or edgeCollection.");
}

function buildTraversalOptions(args: {
  order?: string;
  uniqueVertices?: string;
  uniqueEdges?: string;
  weightAttribute?: string;
  defaultWeight?: number;
}): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};
  if (args.order) options.order = args.order;
  if (args.uniqueVertices) options.uniqueVertices = args.uniqueVertices;
  if (args.uniqueEdges) options.uniqueEdges = args.uniqueEdges;
  if (args.weightAttribute) options.weightAttribute = args.weightAttribute;
  if (args.defaultWeight !== undefined) options.defaultWeight = args.defaultWeight;
  return Object.keys(options).length > 0 ? options : undefined;
}

export class ToolHandlers {
  constructor(
    private db: Database,
    private tools: Tool[],
    private ensureConnection: () => Promise<void>
  ) {}

  async handleListTools() {
    return {
      tools: this.tools,
    };
  }

  async handleCallTool(request: Request): Promise<CallToolResult> {
    try {
      await this.ensureConnection();

      const toolName = request.params?.name;
      const rawArgs = request.params?.arguments;

      switch (toolName) {
        case API_TOOLS.QUERY: {
          const args = parseArgs(queryArgsSchema, rawArgs, toolName);
          try {
            return toToolResponse(
              await runBoundedQuery(this.db, args.query, args.bindVars, args.limit, {
                memoryLimit: args.memoryLimit,
                maxRuntime: args.maxRuntime,
                failOnWarning: args.failOnWarning,
              })
            );
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Query execution failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify AQL syntax, collection names, and bindVars.`
            );
          }
        }

        case API_TOOLS.READ_QUERY: {
          const args = parseArgs(readQueryArgsSchema, rawArgs, toolName);
          assertReadOnlyAql(args.query);
          try {
            return toToolResponse(
              await runBoundedQuery(this.db, args.query, args.bindVars, args.limit, {
                memoryLimit: args.memoryLimit,
                maxRuntime: args.maxRuntime,
                failOnWarning: args.failOnWarning,
              })
            );
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Read query failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify AQL syntax, collection names, and bindVars.`
            );
          }
        }

        case API_TOOLS.VALIDATE_QUERY: {
          const args = parseArgs(validateQueryArgsSchema, rawArgs, toolName);
          try {
            const validation = await this.db.parse(args.query);
            return toToolResponse({ validation });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Query validation failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Fix the AQL syntax and retry before executing the query.`
            );
          }
        }

        case API_TOOLS.EXPLAIN_QUERY: {
          const args = parseArgs(explainQueryArgsSchema, rawArgs, toolName);
          try {
            const explanation = await this.db.explain(args.query, args.bindVars, {
              allPlans: args.allPlans,
              maxNumberOfPlans: args.maxNumberOfPlans,
            } as never);
            return toToolResponse({ explanation });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Explain query failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify AQL syntax, collection names, and bindVars.`
            );
          }
        }

        case API_TOOLS.INSERT: {
          const args = parseArgs(collectionDocumentArgsSchema, rawArgs, toolName);
          try {
            const coll = this.db.collection(args.collection);
            const result = await coll.save(args.document);
            return toToolResponse({ document: result });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Insert operation failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists and the document is valid JSON.`
            );
          }
        }

        case API_TOOLS.BULK_INSERT: {
          const args = parseArgs(bulkInsertArgsSchema, rawArgs, toolName);
          try {
            const options: Record<string, unknown> = { returnNew: args.returnNew };
            if (args.overwriteMode) options.overwriteMode = args.overwriteMode;
            if (args.waitForSync !== undefined) options.waitForSync = args.waitForSync;

            const results = await this.db
              .collection(args.collection)
              .saveAll(args.documents, options as never);
            return toToolResponse({
              results,
              count: results.length,
              errorCount: countOperationFailures(results),
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Bulk insert failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists, documents are valid JSON, and _key conflicts match overwriteMode.`
            );
          }
        }

        case API_TOOLS.INSERT_EDGE: {
          const args = parseArgs(insertEdgeArgsSchema, rawArgs, toolName);
          try {
            const coll = this.db.collection(args.collection);
            const result = await coll.save({
              ...args.document,
              _from: args.from,
              _to: args.to,
            });
            return toToolResponse({ document: result });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Insert edge operation failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the edge collection exists and _from/_to reference valid vertex _id values.`
            );
          }
        }

        case API_TOOLS.UPDATE: {
          const args = parseArgs(updateDocumentArgsSchema, rawArgs, toolName);
          try {
            const coll = this.db.collection(args.collection);
            const result = await coll.update(args.key, args.update);
            return toToolResponse({ document: result });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Update operation failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection and document key exist.`
            );
          }
        }

        case API_TOOLS.BULK_UPDATE: {
          const args = parseArgs(bulkUpdateArgsSchema, rawArgs, toolName);
          try {
            if (
              args.documents.some(
                (document) => !("_key" in document) && !("_id" in document)
              )
            ) {
              throw new Error("Each bulk update document must include _key or _id.");
            }

            const options: Record<string, unknown> = {
              returnNew: args.returnNew,
              returnOld: args.returnOld,
            };
            if (args.keepNull !== undefined) options.keepNull = args.keepNull;
            if (args.mergeObjects !== undefined) options.mergeObjects = args.mergeObjects;
            if (args.waitForSync !== undefined) options.waitForSync = args.waitForSync;

            const results = await this.db
              .collection(args.collection)
              .updateAll(args.documents as never, options as never);
            return toToolResponse({
              results,
              count: results.length,
              errorCount: countOperationFailures(results),
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Bulk update failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify each patch has _key or _id and target documents exist.`
            );
          }
        }

        case API_TOOLS.REMOVE: {
          const args = parseArgs(collectionKeyArgsSchema, rawArgs, toolName);
          try {
            const coll = this.db.collection(args.collection);
            const result = await coll.remove(args.key);
            return toToolResponse({ document: result });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Remove operation failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection and document key exist.`
            );
          }
        }

        case API_TOOLS.COLLECTIONS: {
          try {
            const collections = await this.db.listCollections();
            return toToolResponse({ collections, count: collections.length });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to list collections: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify ARANGO_DB and credentials.`
            );
          }
        }

        case API_TOOLS.DESCRIBE_DATABASE: {
          try {
            const collections = await this.db.listCollections();
            const summaries = [];
            for (const collectionInfo of collections) {
              const coll = this.db.collection(collectionInfo.name);
              const [countInfo, indexes, sample] = await Promise.all([
                coll.count().catch((error) => ({ error: error instanceof Error ? error.message : "Unknown error" })),
                coll.indexes().catch((error) => [{ error: error instanceof Error ? error.message : "Unknown error" }]),
                runBoundedQuery(
                  this.db,
                  "FOR doc IN @@collection LIMIT 1 RETURN doc",
                  { "@collection": collectionInfo.name },
                  1
                ).catch(() => ({ rows: [] })),
              ]);
              const sampleDocument = sample.rows[0] as Record<string, unknown> | undefined;
              summaries.push({
                ...collectionInfo,
                count: "count" in countInfo ? countInfo.count : undefined,
                countError: "error" in countInfo ? countInfo.error : undefined,
                indexes,
                sampleFields: sampleDocument ? Object.keys(sampleDocument).sort() : [],
              });
            }
            return toToolResponse({
              database: this.db.name,
              collections: summaries,
              count: summaries.length,
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to describe database: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify ARANGO_DB and credentials.`
            );
          }
        }

        case API_TOOLS.GET_COLLECTION: {
          const args = parseArgs(collectionArgsSchema, rawArgs, toolName);
          try {
            const coll = this.db.collection(args.collection);
            const [properties, count, indexes] = await Promise.all([
              coll.properties(),
              coll.count(),
              coll.indexes(),
            ]);
            return toToolResponse({
              collection: { name: args.collection, properties, count: count.count, indexes },
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to get collection: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists and credentials allow reading metadata.`
            );
          }
        }

        case API_TOOLS.GET_DOCUMENT: {
          const args = parseArgs(collectionKeyArgsSchema, rawArgs, toolName);
          try {
            const document = await this.db.collection(args.collection).document(args.key);
            return toToolResponse({ document });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to get document: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection and document key exist.`
            );
          }
        }

        case API_TOOLS.LIST_DOCUMENTS: {
          const args = parseArgs(listDocumentsArgsSchema, rawArgs, toolName);
          try {
            const result = await runBoundedQuery(
              this.db,
              "FOR doc IN @@collection LIMIT @offset, @limit RETURN doc",
              { "@collection": args.collection, offset: args.offset, limit: args.limit + 1 },
              args.limit + 1
            );
            const hasMore = result.rows.length > args.limit;
            const documents = hasMore ? result.rows.slice(0, args.limit) : result.rows;
            return toToolResponse({
              documents,
              count: documents.length,
              limit: args.limit,
              offset: args.offset,
              hasMore,
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to list documents: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists and adjust limit/offset if needed.`
            );
          }
        }

        case API_TOOLS.COUNT_DOCUMENTS: {
          const args = parseArgs(collectionArgsSchema, rawArgs, toolName);
          try {
            const count = await this.db.collection(args.collection).count();
            return toToolResponse({ collection: args.collection, count: count.count });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to count documents: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists.`
            );
          }
        }

        case API_TOOLS.SAMPLE_DOCUMENTS: {
          const args = parseArgs(sampleDocumentsArgsSchema, rawArgs, toolName);
          try {
            const result = await runBoundedQuery(
              this.db,
              "FOR doc IN @@collection SORT RAND() LIMIT @limit RETURN doc",
              { "@collection": args.collection, limit: args.limit },
              args.limit
            );
            return toToolResponse({ documents: result.rows, count: result.rows.length });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to sample documents: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists.`
            );
          }
        }

        case API_TOOLS.CREATE_COLLECTION: {
          const args = parseArgs(createCollectionArgsSchema, rawArgs, toolName);
          try {
            const baseOptions: CreateCollectionOptions = {
              waitForSync: args.waitForSync,
            };
            const collection =
              args.type === "edge"
                ? await this.db.createCollection(args.name, {
                    ...baseOptions,
                    type: CollectionType.EDGE_COLLECTION,
                  })
                : await this.db.createCollection(args.name, {
                    ...baseOptions,
                    type: CollectionType.DOCUMENT_COLLECTION,
                  });
            const properties = await collection.properties();
            const indexes = await collection.indexes();
            const response = {
              name: collection.name,
              indexes,
              type: CollectionType[properties.type],
              status: CollectionStatus[properties.status],
            };

            return toToolResponse({ collection: response });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to create collection: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the name is unique and credentials allow collection creation.`
            );
          }
        }

        case API_TOOLS.LIST_INDEXES: {
          const args = parseArgs(collectionArgsSchema, rawArgs, toolName);
          try {
            const indexes = await this.db.collection(args.collection).indexes({ withStats: true });
            return toToolResponse({ indexes });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to list indexes: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists.`
            );
          }
        }

        case API_TOOLS.CREATE_INDEX: {
          const args = parseArgs(createIndexArgsSchema, rawArgs, toolName);
          try {
            if (args.type === "ttl") {
              if (args.expireAfter === undefined || args.fields.length !== 1) {
                throw new Error("TTL indexes require expireAfter and exactly one field.");
              }
            }
            if (args.type === "geo" && args.fields.length !== 1 && args.fields.length !== 2) {
              throw new Error("Geo indexes require either one GeoJSON field or two latitude/longitude fields.");
            }
            const indexOptions: Record<string, unknown> = {
              type: args.type,
              fields: args.fields,
              inBackground: args.inBackground,
            };
            if (args.name) indexOptions.name = args.name;
            if (args.unique !== undefined) indexOptions.unique = args.unique;
            if (args.sparse !== undefined) indexOptions.sparse = args.sparse;
            if (args.expireAfter !== undefined) indexOptions.expireAfter = args.expireAfter;

            const index = await this.db.collection(args.collection).ensureIndex(indexOptions as never);
            return toToolResponse({ index });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to create index: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify fields exist, index options match the index type, and credentials allow index creation.`
            );
          }
        }

        case API_TOOLS.LIST_VIEWS: {
          try {
            const views = await this.db.listViews();
            return toToolResponse({ views });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to list views: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify ARANGO_DB and credentials.`
            );
          }
        }

        case API_TOOLS.CREATE_SEARCH_VIEW: {
          const args = parseArgs(createSearchViewArgsSchema, rawArgs, toolName);
          try {
            const view = await this.db.createView(args.name, {
              type: "arangosearch",
              links: {
                [args.collection]: {
                  includeAllFields: args.includeAllFields,
                  analyzers: args.analyzers,
                },
              },
            } as never);
            const properties = await view.properties();
            return toToolResponse({ view: { name: view.name, properties } });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to create search view: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists and the view name is unique.`
            );
          }
        }

        case API_TOOLS.SEARCH: {
          const args = parseArgs(searchArgsSchema, rawArgs, toolName);
          assertFieldPath(args.field);
          try {
            const result = await runBoundedQuery(
              this.db,
              `FOR doc IN ${quoteAqlIdentifier(args.view)} SEARCH ANALYZER(doc.${args.field} IN TOKENS(@searchText, @analyzer), @analyzer) SORT BM25(doc) DESC LIMIT @limit RETURN { document: doc, score: BM25(doc) }`,
              { searchText: args.searchText, analyzer: args.analyzer, limit: args.limit },
              args.limit
            );
            return toToolResponse({ rows: result.rows, count: result.rows.length });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Search failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the view exists, field is indexed, and analyzer matches the view configuration.`
            );
          }
        }

        case API_TOOLS.LIST_ANALYZERS: {
          try {
            const analyzers = await this.db.listAnalyzers();
            return toToolResponse({ analyzers });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to list analyzers: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify ARANGO_DB and credentials.`
            );
          }
        }

        case API_TOOLS.CREATE_ANALYZER: {
          const args = parseArgs(createAnalyzerArgsSchema, rawArgs, toolName);
          try {
            const analyzer = await this.db.createAnalyzer(args.name, {
              type: args.type,
              properties: args.properties,
              features: args.features,
            } as never);
            const description = await analyzer.get();
            return toToolResponse({ analyzer: description });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to create analyzer: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify analyzer type, properties, and unique name.`
            );
          }
        }

        case API_TOOLS.LIST_GRAPHS: {
          try {
            const graphs = await this.db.listGraphs();
            return toToolResponse({ graphs });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to list graphs: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify ARANGO_DB and credentials.`
            );
          }
        }

        case API_TOOLS.CREATE_GRAPH: {
          const args = parseArgs(createGraphArgsSchema, rawArgs, toolName);
          try {
            const graph = await this.db.createGraph(args.name, [
              {
                collection: args.edgeCollection,
                from: args.fromCollections,
                to: args.toCollections,
              },
            ]);
            const description = await graph.get();
            return toToolResponse({ graph: description });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to create graph: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify vertex and edge collections exist and the graph name is unique.`
            );
          }
        }

        case API_TOOLS.TRAVERSE: {
          const args = parseArgs(traverseArgsSchema, rawArgs, toolName);
          if (args.minDepth > args.maxDepth) {
            throw new McpError(ErrorCode.InvalidRequest, "minDepth must be less than or equal to maxDepth.");
          }
          try {
            const source = getGraphSource(args);
            const options = buildTraversalOptions(args);
            const optionsClause = options ? ` OPTIONS ${JSON.stringify(options)}` : "";
            const bindVars: Record<string, unknown> = {
              startVertex: args.startVertex,
              limit: args.limit,
            };
            const result = await runBoundedQuery(
              this.db,
              `FOR vertex, edge, path IN ${args.minDepth}..${args.maxDepth} ${args.direction} @startVertex ${source}${optionsClause} LIMIT @limit RETURN { vertex, edge, path }`,
              bindVars,
              args.limit
            );
            return toToolResponse({ rows: result.rows, count: result.rows.length });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Traversal failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify startVertex uses collection/key format and edgeCollection exists.`
            );
          }
        }

        case API_TOOLS.SHORTEST_PATH: {
          const args = parseArgs(shortestPathArgsSchema, rawArgs, toolName);
          try {
            const source = getGraphSource(args);
            const options = buildTraversalOptions(args);
            const optionsClause = options ? ` OPTIONS ${JSON.stringify(options)}` : "";
            const bindVars: Record<string, unknown> = {
              startVertex: args.startVertex,
              targetVertex: args.targetVertex,
            };
            const result = await runBoundedQuery(
              this.db,
              `FOR vertex, edge IN ${args.direction} SHORTEST_PATH @startVertex TO @targetVertex ${source}${optionsClause} RETURN { vertex, edge }`,
              bindVars,
              1000
            );
            return toToolResponse({ rows: result.rows, count: result.rows.length });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Shortest path failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify vertices use collection/key format and edgeCollection exists.`
            );
          }
        }

        case API_TOOLS.DROP_COLLECTION: {
          const args = parseArgs(dropCollectionArgsSchema, rawArgs, toolName);
          try {
            await this.db.collection(args.name).drop();
            return toToolResponse({ collection: { name: args.name, dropped: true } });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Failed to drop collection: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Verify the collection exists, credentials allow collection deletion, and confirm is true.`
            );
          }
        }

        case API_TOOLS.BACKUP: {
          const args = parseArgs(backupArgsSchema, rawArgs, toolName);

          try {
            const outputDir = await resolveBackupOutputDir(args.outputDir);
            const results = [];

            async function backupCollection(
              db: Database,
              outputDir: string,
              collection: string,
              docLimit: number
            ) {
              try {
                const cursor = await db.query<unknown>(
                  "FOR doc IN @@collection LIMIT @limit RETURN doc",
                  { "@collection": collection, limit: docLimit },
                  { batchSize: docLimit, count: true }
                );
                const { rows } = await readCursorRows(cursor, docLimit);
                const filePath = join(outputDir, `${collection}.json`);
                await fs.writeFile(filePath, JSON.stringify(rows, null, 2), {
                  flag: "wx",
                  mode: 0o640,
                });
                return {
                  collection,
                  status: "success",
                  count: rows.length,
                  totalCount: cursor.count,
                  outputFile: filePath,
                };
              } catch (error) {
                return {
                  collection,
                  status: "error",
                  error:
                    error instanceof Error
                      ? `${error.message}. Remove the existing backup file or use a new outputDir.`
                      : "Unknown error",
                };
              }
            }

            if (args.collection) {
              results.push(
                await backupCollection(this.db, outputDir, args.collection, args.docLimit)
              );
            } else {
              const collections = await this.db.listCollections();
              for (let i = 0; i < collections.length; i += PARALLEL_BACKUP_CHUNKS) {
                const chunk = collections.slice(i, i + PARALLEL_BACKUP_CHUNKS);
                const chunkResults = await Promise.all(
                  chunk.map((collection) =>
                    backupCollection(this.db, outputDir, collection.name, args.docLimit)
                  )
                );
                results.push(...chunkResults);
              }
            }

            const errorCount = results.filter((result) => result.status === "error").length;
            const successCount = results.length - errorCount;

            return toToolResponse({
              status: errorCount > 0 ? "completed_with_errors" : "completed",
              backupRoot: getBackupRoot(),
              outputDirectory: outputDir,
              successCount,
              errorCount,
              results,
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Backup failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }. Set ARANGO_BACKUP_ROOT to a writable safe directory and use a simple outputDir like nightly_2026_06_01.`
            );
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${toolName}. Call tools/list to inspect available ArangoDB tools.`
          );
      }
    } catch (error: unknown) {
      if (error instanceof McpError) throw error;

      if (error instanceof Error && error.message.includes("connect")) {
        throw new McpError(
          ErrorCode.InternalError,
          `Database connection lost: ${error.message}. Verify ARANGO_URL, network reachability, and credentials.`
        );
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Database error: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Check server logs and ArangoDB availability.`
      );
    }
  }
}
