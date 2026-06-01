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
  collectionDocumentArgsSchema,
  collectionKeyArgsSchema,
  createCollectionArgsSchema,
  dropCollectionArgsSchema,
  queryArgsSchema,
  updateDocumentArgsSchema,
} from "./types.js";

const PARALLEL_BACKUP_CHUNKS = 5;

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
            const cursor = await this.db.query<unknown>(args.query, args.bindVars, {
              batchSize: args.limit,
              count: true,
            });
            const { rows, hasMore } = await readCursorRows(cursor, args.limit);
            return toToolResponse({
              rows,
              count: rows.length,
              totalCount: cursor.count,
              hasMore,
              limit: args.limit,
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Query execution failed: ${
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
