import { Tool } from '@modelcontextprotocol/sdk/types.js';

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
						additionalProperties: true,
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
						additionalProperties: true,
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
						additionalProperties: true,
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
			description: 'Backup collections to JSON files. If no collection is specified, backs up all collections.',
			inputSchema: {
				type: 'object',
				properties: {
					outputDir: {
						type: 'string',
						description: 'Directory to store backup files',
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
	];
}

export enum API_TOOLS {
	QUERY = 'arango_query',
	INSERT = 'arango_insert',
	UPDATE = 'arango_update',
	REMOVE = 'arango_remove',
	BACKUP = 'arango_backup',
	COLLECTIONS = 'arango_list_collections',
}
