#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Database, aql } from 'arangojs';

// Type definitions for request arguments
interface QueryArgs {
	query: string;
	bindVars?: Record<string, unknown>;
}

interface CollectionDocumentArgs {
	collection: string;
	document: Record<string, unknown>;
}

interface CollectionKeyArgs {
	collection: string;
	key: string;
}

interface UpdateDocumentArgs extends CollectionKeyArgs {
	update: Record<string, unknown>;
}

// Get connection details from environment variables
const ARANGO_URL = process.env.ARANGO_URL || 'http://localhost:8529';
const ARANGO_DB = process.env.ARANGO_DB || '_system';
const ARANGO_USERNAME = process.env.ARANGO_USERNAME;
const ARANGO_PASSWORD = process.env.ARANGO_PASSWORD;

if (!ARANGO_USERNAME || !ARANGO_PASSWORD) {
	throw new Error('ARANGO_USERNAME and ARANGO_PASSWORD environment variables are required');
}

class ArangoServer {
	private server: Server;
	private db: Database;

	constructor() {
		// Initialize ArangoDB connection
		this.db = new Database([ARANGO_URL]);
		this.db.useBasicAuth(ARANGO_USERNAME, ARANGO_PASSWORD);
		this.db = this.db.database(ARANGO_DB);

		// Initialize MCP server
		this.server = new Server(
			{
				name: 'arango-server',
				version: '0.1.0',
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);

		this.setupToolHandlers();

		// Error handling
		this.server.onerror = (error) => console.error('[MCP Error]', error);
		process.on('SIGINT', async () => {
			await this.server.close();
			process.exit(0);
		});
	}

	private setupToolHandlers() {
		this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: [
				{
					name: 'query',
					description: 'Execute an AQL query',
					inputSchema: {
						type: 'object',
						properties: {
							query: {
								type: 'string',
								description: 'AQL query string',
							},
							bindVars: {
								type: 'object',
								description: 'Query bind variables',
								additionalProperties: true,
							},
						},
						required: ['query'],
					},
				},
				{
					name: 'insert',
					description: 'Insert a document into a collection',
					inputSchema: {
						type: 'object',
						properties: {
							collection: {
								type: 'string',
								description: 'Collection name',
							},
							document: {
								type: 'object',
								description: 'Document to insert',
								additionalProperties: true,
							},
						},
						required: ['collection', 'document'],
					},
				},
				{
					name: 'update',
					description: 'Update a document in a collection',
					inputSchema: {
						type: 'object',
						properties: {
							collection: {
								type: 'string',
								description: 'Collection name',
							},
							key: {
								type: 'string',
								description: 'Document key',
							},
							update: {
								type: 'object',
								description: 'Update object',
								additionalProperties: true,
							},
						},
						required: ['collection', 'key', 'update'],
					},
				},
				{
					name: 'remove',
					description: 'Remove a document from a collection',
					inputSchema: {
						type: 'object',
						properties: {
							collection: {
								type: 'string',
								description: 'Collection name',
							},
							key: {
								type: 'string',
								description: 'Document key',
							},
						},
						required: ['collection', 'key'],
					},
				},
				{
					name: 'list_collections',
					description: 'List all collections in the database',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
			],
		}));

		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			try {
				switch (request.params.name) {
					case 'query': {
						const args = request.params.arguments as unknown as QueryArgs;
						const cursor = await this.db.query(args.query, args.bindVars || {});
						const result = await cursor.all();
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(result, null, 2),
								},
							],
						};
					}

					case 'insert': {
						const args = request.params.arguments as unknown as CollectionDocumentArgs;
						const coll = this.db.collection(args.collection);
						const result = await coll.save(args.document);
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(result, null, 2),
								},
							],
						};
					}

					case 'update': {
						const args = request.params.arguments as unknown as UpdateDocumentArgs;
						const coll = this.db.collection(args.collection);
						const result = await coll.update(args.key, args.update);
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(result, null, 2),
								},
							],
						};
					}

					case 'remove': {
						const args = request.params.arguments as unknown as CollectionKeyArgs;
						const coll = this.db.collection(args.collection);
						const result = await coll.remove(args.key);
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(result, null, 2),
								},
							],
						};
					}

					case 'list_collections': {
						const collections = await this.db.listCollections();
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(collections, null, 2),
								},
							],
						};
					}

					default:
						throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
				}
			} catch (error: unknown) {
				if (error instanceof McpError) throw error;
				const message = error instanceof Error ? error.message : 'Unknown error';
				throw new McpError(ErrorCode.InternalError, `Database error: ${message}`);
			}
		});
	}

	async run() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error('ArangoDB MCP server running on stdio');
	}
}

const server = new ArangoServer();
server.run().catch(console.error);
