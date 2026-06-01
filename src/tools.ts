import { Tool } from "@modelcontextprotocol/sdk/types.js";

const jsonValueSchema = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    { type: "array", items: {} },
    { type: "object", additionalProperties: true },
  ],
};

const objectSchema = {
  type: "object",
  additionalProperties: jsonValueSchema,
};

const collectionNameSchema = {
  type: "string",
  pattern: "^_?[A-Za-z][A-Za-z0-9_-]*$",
  description: "ArangoDB collection name, for example users, _users, or product_edges",
};

const metadataSchema = {
  type: "object",
  properties: {
    _id: { type: "string" },
    _key: { type: "string" },
    _rev: { type: "string" },
  },
  additionalProperties: true,
};

export function createToolDefinitions(): Tool[] {
  return [
    {
      name: API_TOOLS.QUERY,
      description:
        "Execute an AQL query and return up to the requested limit of rows. Use bindVars for parameters.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "AQL query string, for example FOR doc IN users RETURN doc",
          },
          bindVars: {
            ...objectSchema,
            description: "AQL bind variables, for example {\"name\": \"Alice\"}",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: "Maximum rows to return from the cursor",
          },
        },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: {
          rows: { type: "array", items: {} },
          count: { type: "integer" },
          totalCount: { anyOf: [{ type: "integer" }, { type: "null" }] },
          hasMore: { type: "boolean" },
          limit: { type: "integer" },
        },
        required: ["rows", "count", "totalCount", "hasMore", "limit"],
      },
    },
    {
      name: API_TOOLS.INSERT,
      description: "Insert a document into a collection and return document metadata.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          collection: collectionNameSchema,
          document: {
            ...objectSchema,
            description: "Document to insert, for example {\"name\": \"Alice\"}",
          },
        },
        required: ["collection", "document"],
      },
      outputSchema: {
        type: "object",
        properties: { document: metadataSchema },
        required: ["document"],
      },
    },
    {
      name: API_TOOLS.UPDATE,
      description: "Update a document in a collection by key and return metadata.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          collection: collectionNameSchema,
          key: { type: "string", minLength: 1, description: "Document _key" },
          update: {
            ...objectSchema,
            description: "Partial update object, for example {\"status\": \"active\"}",
          },
        },
        required: ["collection", "key", "update"],
      },
      outputSchema: {
        type: "object",
        properties: { document: metadataSchema },
        required: ["document"],
      },
    },
    {
      name: API_TOOLS.REMOVE,
      description: "Remove a document from a collection by key and return metadata.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          collection: collectionNameSchema,
          key: { type: "string", minLength: 1, description: "Document _key" },
        },
        required: ["collection", "key"],
      },
      outputSchema: {
        type: "object",
        properties: { document: metadataSchema },
        required: ["document"],
      },
    },
    {
      name: API_TOOLS.BACKUP,
      description:
        "Backup collections to JSON files under ARANGO_BACKUP_ROOT. outputDir must be a safe relative directory name.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          outputDir: {
            type: "string",
            pattern: "^[A-Za-z0-9_-]+$",
            default: "default",
            description:
              "Safe subdirectory name under ARANGO_BACKUP_ROOT. Absolute paths, slashes, and .. are rejected.",
          },
          collection: {
            ...collectionNameSchema,
            description: "Collection name to backup. If omitted, backs up all collections.",
          },
          docLimit: {
            type: "integer",
            minimum: 1,
            maximum: 10000,
            default: 1000,
            description: "Maximum documents to backup per collection",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          backupRoot: { type: "string" },
          outputDirectory: { type: "string" },
          successCount: { type: "integer" },
          errorCount: { type: "integer" },
          results: { type: "array", items: { type: "object", additionalProperties: true } },
        },
        required: ["status", "backupRoot", "outputDirectory", "successCount", "errorCount", "results"],
      },
    },
    {
      name: API_TOOLS.COLLECTIONS,
      description: "List all collections in the selected database.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {},
      },
      outputSchema: {
        type: "object",
        properties: {
          collections: { type: "array", items: { type: "object", additionalProperties: true } },
          count: { type: "integer" },
        },
        required: ["collections", "count"],
      },
    },
    {
      name: API_TOOLS.CREATE_COLLECTION,
      description: "Create a document or edge collection in the selected database.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          name: collectionNameSchema,
          type: {
            type: "string",
            description: 'Collection type: "document" or "edge"',
            default: "document",
            enum: ["document", "edge"],
          },
          waitForSync: {
            type: "boolean",
            description: "If true, wait for data synchronization before returning",
            default: false,
          },
        },
        required: ["name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          collection: { type: "object", additionalProperties: true },
        },
        required: ["collection"],
      },
    },
    {
      name: API_TOOLS.DROP_COLLECTION,
      description: "Drop an existing collection from the selected database.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          name: collectionNameSchema,
          confirm: {
            type: "boolean",
            const: true,
            description:
              "Must be true to confirm permanent deletion of the collection and all documents.",
          },
        },
        required: ["name", "confirm"],
      },
      outputSchema: {
        type: "object",
        properties: {
          collection: {
            type: "object",
            properties: {
              name: { type: "string" },
              dropped: { type: "boolean" },
            },
            required: ["name", "dropped"],
          },
        },
        required: ["collection"],
      },
    },
  ];
}

export enum API_TOOLS {
  QUERY = "arango_query",
  INSERT = "arango_insert",
  UPDATE = "arango_update",
  REMOVE = "arango_remove",
  BACKUP = "arango_backup",
  COLLECTIONS = "arango_list_collections",
  CREATE_COLLECTION = "arango_create_collection",
  DROP_COLLECTION = "arango_drop_collection",
}
