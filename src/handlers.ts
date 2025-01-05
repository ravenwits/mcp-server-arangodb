import { ErrorCode, McpError, Request, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Database } from 'arangojs';
import { CollectionStatus, CollectionType, CreateCollectionOptions } from 'arangojs/collection';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { API_TOOLS } from './tools.js';
import { BackupArgs, CollectionDocumentArgs, CollectionKeyArgs, CreateCollectionArgs, QueryArgs, UpdateDocumentArgs } from './types.js';

const PARALLEL_BACKUP_CHUNKS = 5;

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

				case API_TOOLS.CREATE_COLLECTION: {
					const args = request.params.arguments as CreateCollectionArgs;
					try {
						const options: CreateCollectionOptions & { type?: CollectionType } = {
							waitForSync: args.waitForSync || false,
							type: args.type ?? CollectionType.DOCUMENT_COLLECTION,
						};

						const collection = await this.db.createCollection(
							args.name,
							options as CreateCollectionOptions & {
								type: typeof options.type extends CollectionType.EDGE_COLLECTION ? CollectionType.EDGE_COLLECTION : CollectionType.DOCUMENT_COLLECTION;
							},
						);

						// Return a simplified response without circular references
						const properties = await collection.properties();
						const response = {
							name: collection.name,
							indexes: collection.indexes(),
							type: CollectionType[properties.type],
							status: CollectionStatus[properties.status],
						};

						return {
							content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
						};
					} catch (error) {
						throw new McpError(ErrorCode.InvalidRequest, `Failed to create collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				case API_TOOLS.BACKUP: {
					const args = request.params.arguments as BackupArgs;
					const outputDir = resolve(args.outputDir);
					const collection = args.collection;
					const docLimit = args.docLimit;

					try {
						await fs.mkdir(outputDir, { recursive: true, mode: 0o755 });
					} catch (error) {
						throw new McpError(ErrorCode.InternalError, `Failed to create backup directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}

					try {
						const results = [];
						async function backupCollection(db: Database, outputDir: string, collection?: string, docLimit?: number) {
							try {
								const cursor = await db.query({
									query: docLimit ? 'FOR doc IN @@collection LIMIT @limit RETURN doc' : 'FOR doc IN @@collection RETURN doc',
									bindVars: {
										'@collection': collection,
										...(docLimit && { limit: docLimit }),
									},
								});
								const data = await cursor.all();
								const filePath = join(outputDir, `${collection}.json`);
								await fs.writeFile(filePath, JSON.stringify(data, null, 2));
								return {
									collection,
									status: 'success',
									count: data.length,
									outputFile: filePath,
								};
							} catch (error) {
								return {
									collection,
									status: 'error',
									error: error instanceof Error ? error.message : 'Unknown error',
								};
							}
						}

						if (collection) {
							// Backup single collection
							console.info(`Backing up collection: ${collection}`);
							results.push(await backupCollection(this.db, outputDir, collection, docLimit));
						} else {
							// Backup all collections in parallel chunks
							const collections = await this.db.listCollections();
							console.info(`Found ${collections.length} collections to backup.`);

							// Process collections in chunks
							for (let i = 0; i < collections.length; i += PARALLEL_BACKUP_CHUNKS) {
								const chunk = collections.slice(i, i + PARALLEL_BACKUP_CHUNKS);
								const backupPromises = chunk.map((collection) => {
									console.info(`Backing up collection: ${collection.name}`);
									return backupCollection(this.db, outputDir, collection.name, docLimit);
								});

								// Wait for the current chunk to complete before processing the next
								const chunkResults = await Promise.all(backupPromises);
								results.push(...chunkResults);
							}
						}

						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(
										{
											status: 'completed',
											outputDirectory: outputDir,
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
