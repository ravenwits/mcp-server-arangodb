import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CollectionType } from 'arangojs/collection';

export function createToolDefinitions(): Tool[] {
	return [
		{
			name: API_TOOLS.QUERY as string,
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
						additionalProperties: { type: 'object' },
					},
				},
				required: ['query'],
			},
		},
		{
			name: API_TOOLS.INSERT as string,
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
						additionalProperties: { type: 'object' },
					},
				},
				required: ['collection', 'document'],
			},
		},
		{
			name: API_TOOLS.UPDATE as string,
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
						additionalProperties: { type: 'object' },
					},
				},
				required: ['collection', 'key', 'update'],
			},
		},
		{
			name: API_TOOLS.REMOVE as string,
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
			name: API_TOOLS.BACKUP as string,
			description: 'Backup collections to JSON files.',
			inputSchema: {
				type: 'object',
				properties: {
					outputDir: {
						type: 'string',
						description: 'An absolute directory path to store backup files',
						default: './backup',
						optional: true,
					},
					collection: {
						type: 'string',
						description: 'Collection name to backup. If not provided, backs up all collections.',
						optional: true,
					},
					docLimit: {
						type: 'integer',
						description: 'Limit the number of documents to backup. If not provided, backs up all documents.',
						optional: true,
					},
				},
				required: ['outputDir'],
			},
		},
		{
			name: API_TOOLS.COLLECTIONS as string,
			description: 'List all collections in the database',
			inputSchema: {
				type: 'object',
				properties: {},
			},
		},
		{
			name: API_TOOLS.CREATE_COLLECTION as string,
			description: 'Create a new collection in the database',
			inputSchema: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						description: 'Name of the collection to create',
					},
					type: {
						type: 'integer',
						description: 'Type of collection to create (2 for document collection, 3 for edge collection)',
						default: CollectionType.DOCUMENT_COLLECTION,
						enum: [CollectionType.DOCUMENT_COLLECTION, CollectionType.EDGE_COLLECTION],
					},
					waitForSync: {
						type: 'boolean',
						description: 'If true, wait for data to be synchronized to disk before returning',
						default: false,
					},
				},
				required: ['name'],
			},
		},
	];
}

export enum API_TOOLS {
	QUERY = 'arango_query',
	INSERT = 'arango_insert',
	UPDATE = 'arango_update',
	REMOVE = 'arango_remove',
	BACKUP = 'arango_backup',
	COLLECTIONS = 'arango_list_collections',
	CREATE_COLLECTION = 'arango_create_collection',
}
