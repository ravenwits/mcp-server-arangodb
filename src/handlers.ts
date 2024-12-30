import { ErrorCode, McpError, Request, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Database, aql } from 'arangojs';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { API_TOOLS } from './tools.js';
import { BackupArgs, CollectionDocumentArgs, CollectionKeyArgs, QueryArgs, UpdateDocumentArgs } from './types.js';

const PARALLEL_BACKUP_CHUNKS = 5; // Number of collections to backup in parallel

export class ToolHandlers {
	constructor(private db: Database, private tools: Tool[], private ensureConnection: () => Promise<void>) {}

	async handleListTools() {
		return {
			tools: this.tools,
		};
	}

	async handleCallTool(request: Request) {
		try {
			await this.ensureConnection();

			switch (request.params?.name) {
				case API_TOOLS.QUERY: {
					const args = request.params.arguments as QueryArgs;
					try {
						const cursor = await this.db.query(args.query, args.bindVars || {});
						const result = await cursor.all();
						return {
							content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InvalidRequest, `Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				case API_TOOLS.INSERT: {
					const args = request.params.arguments as CollectionDocumentArgs;
					try {
						const coll = this.db.collection(args.collection);
						const result = await coll.save(args.document);
						return {
							content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InvalidRequest, `Insert operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				case API_TOOLS.UPDATE: {
					const args = request.params.arguments as UpdateDocumentArgs;
					try {
						const coll = this.db.collection(args.collection);
						const result = await coll.update(args.key, args.update);
						return {
							content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InvalidRequest, `Update operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				case API_TOOLS.REMOVE: {
					const args = request.params.arguments as CollectionKeyArgs;
					try {
						const coll = this.db.collection(args.collection);
						const result = await coll.remove(args.key);
						return {
							content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InvalidRequest, `Remove operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				case API_TOOLS.COLLECTIONS: {
					try {
						const collections = await this.db.listCollections();
						return {
							content: [{ type: 'text', text: JSON.stringify(collections, null, 2) }],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InternalError, `Failed to list collections: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				case API_TOOLS.BACKUP: {
					const args = request.params.arguments as BackupArgs;
					const outputDir = resolve(args.outputDir);

					try {
						await fs.mkdir(outputDir, { recursive: true, mode: 0o755 });
					} catch (error) {
						throw new McpError(ErrorCode.InternalError, `Failed to create backup directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}

					try {
						const collections = await this.db.listCollections();
						const results = [];
						const totalCollections = collections.length;

						// Process collections in parallel chunks
						for (let i = 0; i < collections.length; i += PARALLEL_BACKUP_CHUNKS) {
							const chunk = collections.slice(i, i + PARALLEL_BACKUP_CHUNKS);
							const chunkPromises = chunk.map(async (collection) => {
								try {
									const cursor = await this.db.query(aql`
										FOR doc IN ${collection.name}
										RETURN doc
									`);
									const data = await cursor.all();
									const filePath = join(outputDir, `${collection.name}.json`);
									await fs.writeFile(filePath, JSON.stringify(data, null, 2));

									return {
										collection: collection.name,
										status: 'success',
										count: data.length,
										progress: `${i + 1}/${totalCollections} collections processed`,
									};
								} catch (error) {
									return {
										collection: collection.name,
										status: 'error',
										error: error instanceof Error ? error.message : 'Unknown error',
										progress: `${i + 1}/${totalCollections} collections processed`,
									};
								}
							});

							const chunkResults = await Promise.all(chunkPromises);
							results.push(...chunkResults);
						}

						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(
										{
											status: 'completed',
											outputDirectory: outputDir,
											totalCollections,
											results,
										},
										null,
										2,
									),
								},
							],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InternalError, `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				default:
					throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params?.name}`);
			}
		} catch (error: unknown) {
			if (error instanceof McpError) throw error;

			// Check if it's a connection error
			if (error instanceof Error && error.message.includes('connect')) {
				throw new McpError(ErrorCode.InternalError, `Database connection lost: ${error.message}`);
			}

			throw new McpError(ErrorCode.InternalError, `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
