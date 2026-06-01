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
          memoryLimit: {
            type: "integer",
            minimum: 0,
            description: "Maximum memory in bytes. 0 disables the ArangoDB memory limit.",
          },
          maxRuntime: {
            type: "number",
            minimum: 0,
            description: "Maximum query runtime in seconds. 0 allows unlimited runtime.",
          },
          failOnWarning: {
            type: "boolean",
            description: "If true, abort the query when ArangoDB emits a warning.",
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
      name: API_TOOLS.BULK_INSERT,
      description: "Insert up to 1000 documents into a collection in one request.",
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
          documents: {
            type: "array",
            items: objectSchema,
            minItems: 1,
            maxItems: 1000,
            description: "Documents to insert. Each item may include _key.",
          },
          returnNew: { type: "boolean", default: false },
          overwriteMode: { type: "string", enum: ["conflict", "ignore", "replace", "update"] },
          waitForSync: { type: "boolean" },
        },
        required: ["collection", "documents"],
      },
      outputSchema: {
        type: "object",
        properties: {
          results: { type: "array", items: { type: "object", additionalProperties: true } },
          count: { type: "integer" },
          errorCount: { type: "integer" },
        },
        required: ["results", "count", "errorCount"],
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
      name: API_TOOLS.BULK_UPDATE,
      description: "Partially update up to 1000 documents identified by _key or _id.",
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
          documents: {
            type: "array",
            items: objectSchema,
            minItems: 1,
            maxItems: 1000,
            description: "Patch documents. Each item must include _key or _id.",
          },
          returnNew: { type: "boolean", default: false },
          returnOld: { type: "boolean", default: false },
          keepNull: { type: "boolean" },
          mergeObjects: { type: "boolean" },
          waitForSync: { type: "boolean" },
        },
        required: ["collection", "documents"],
      },
      outputSchema: {
        type: "object",
        properties: {
          results: { type: "array", items: { type: "object", additionalProperties: true } },
          count: { type: "integer" },
          errorCount: { type: "integer" },
        },
        required: ["results", "count", "errorCount"],
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
      name: API_TOOLS.DESCRIBE_DATABASE,
      description:
        "Summarize database collections, counts, indexes, and sample fields. Use before exploring an unknown database.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: {
          database: { type: "string" },
          collections: { type: "array", items: { type: "object", additionalProperties: true } },
          count: { type: "integer" },
        },
        required: ["database", "collections", "count"],
      },
    },
    {
      name: API_TOOLS.GET_COLLECTION,
      description: "Get collection properties, count, and indexes for one collection.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: { collection: collectionNameSchema },
        required: ["collection"],
      },
      outputSchema: {
        type: "object",
        properties: { collection: { type: "object", additionalProperties: true } },
        required: ["collection"],
      },
    },
    {
      name: API_TOOLS.GET_DOCUMENT,
      description: "Fetch a single document by collection and _key.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
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
        properties: { document: { type: "object", additionalProperties: true } },
        required: ["document"],
      },
    },
    {
      name: API_TOOLS.LIST_DOCUMENTS,
      description: "List documents from a collection with bounded limit and offset pagination.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          collection: collectionNameSchema,
          limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
          offset: { type: "integer", minimum: 0, default: 0 },
        },
        required: ["collection"],
      },
      outputSchema: {
        type: "object",
        properties: {
          documents: { type: "array", items: {} },
          count: { type: "integer" },
          limit: { type: "integer" },
          offset: { type: "integer" },
          hasMore: { type: "boolean" },
        },
        required: ["documents", "count", "limit", "offset", "hasMore"],
      },
    },
    {
      name: API_TOOLS.COUNT_DOCUMENTS,
      description: "Count documents in a collection.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: { collection: collectionNameSchema },
        required: ["collection"],
      },
      outputSchema: {
        type: "object",
        properties: { collection: { type: "string" }, count: { type: "integer" } },
        required: ["collection", "count"],
      },
    },
    {
      name: API_TOOLS.SAMPLE_DOCUMENTS,
      description: "Return a small random sample of documents for schema discovery.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          collection: collectionNameSchema,
          limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        },
        required: ["collection"],
      },
      outputSchema: {
        type: "object",
        properties: { documents: { type: "array", items: {} }, count: { type: "integer" } },
        required: ["documents", "count"],
      },
    },
    {
      name: API_TOOLS.READ_QUERY,
      description: "Execute a read-only AQL query. Rejects AQL write operations.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Read-only AQL query" },
          bindVars: { ...objectSchema, description: "AQL bind variables" },
          limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
          memoryLimit: { type: "integer", minimum: 0 },
          maxRuntime: { type: "number", minimum: 0 },
          failOnWarning: { type: "boolean" },
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
      name: API_TOOLS.VALIDATE_QUERY,
      description: "Parse and validate an AQL query without executing it.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "AQL query to parse and validate" },
        },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: { validation: { type: "object", additionalProperties: true } },
        required: ["validation"],
      },
    },
    {
      name: API_TOOLS.EXPLAIN_QUERY,
      description: "Explain an AQL query plan to inspect indexes, scans, and optimizer behavior.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "AQL query to explain" },
          bindVars: { ...objectSchema, description: "AQL bind variables" },
          allPlans: { type: "boolean", default: false },
          maxNumberOfPlans: { type: "integer", minimum: 1, maximum: 128, default: 1 },
        },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: { explanation: { type: "object", additionalProperties: true } },
        required: ["explanation"],
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
      name: API_TOOLS.LIST_INDEXES,
      description: "List indexes for a collection, optionally including stats.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: { collection: collectionNameSchema },
        required: ["collection"],
      },
      outputSchema: {
        type: "object",
        properties: { indexes: { type: "array", items: { type: "object", additionalProperties: true } } },
        required: ["indexes"],
      },
    },
    {
      name: API_TOOLS.CREATE_INDEX,
      description: "Create a persistent, geo, TTL, or inverted index on a collection.",
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
          type: { type: "string", enum: ["persistent", "geo", "ttl", "inverted"] },
          fields: {
            type: "array",
            items: {
              anyOf: [
                { type: "string", minLength: 1 },
                { type: "object", additionalProperties: true },
              ],
            },
            minItems: 1,
            description:
              'Index fields. Inverted indexes may use field objects such as {"name":"text","analyzer":"text_en"}.',
          },
          name: collectionNameSchema,
          unique: { type: "boolean" },
          sparse: { type: "boolean" },
          inBackground: { type: "boolean", default: true },
          expireAfter: { type: "integer", minimum: 1 },
        },
        required: ["collection", "type", "fields"],
      },
      outputSchema: {
        type: "object",
        properties: { index: { type: "object", additionalProperties: true } },
        required: ["index"],
      },
    },
    {
      name: API_TOOLS.LIST_VIEWS,
      description: "List ArangoSearch and search-alias views.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: { views: { type: "array", items: { type: "object", additionalProperties: true } } },
        required: ["views"],
      },
    },
    {
      name: API_TOOLS.CREATE_SEARCH_VIEW,
      description: "Create an arangosearch View linked to one collection.",
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
          collection: collectionNameSchema,
          includeAllFields: { type: "boolean", default: true },
          analyzers: { type: "array", items: { type: "string" }, default: ["identity"] },
        },
        required: ["name", "collection"],
      },
      outputSchema: {
        type: "object",
        properties: { view: { type: "object", additionalProperties: true } },
        required: ["view"],
      },
    },
    {
      name: API_TOOLS.SEARCH,
      description: "Search an ArangoSearch View with analyzer-aware exact/token matching and BM25 ranking.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          view: collectionNameSchema,
          field: { type: "string", minLength: 1, description: "Document field path to search" },
          searchText: { type: "string", minLength: 1 },
          analyzer: { type: "string", default: "identity" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        },
        required: ["view", "field", "searchText"],
      },
      outputSchema: {
        type: "object",
        properties: { rows: { type: "array", items: {} }, count: { type: "integer" } },
        required: ["rows", "count"],
      },
    },
    {
      name: API_TOOLS.LIST_ANALYZERS,
      description: "List configured ArangoSearch analyzers.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: { analyzers: { type: "array", items: { type: "object", additionalProperties: true } } },
        required: ["analyzers"],
      },
    },
    {
      name: API_TOOLS.CREATE_ANALYZER,
      description: "Create an ArangoSearch analyzer.",
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
          type: { type: "string", minLength: 1 },
          properties: objectSchema,
          features: { type: "array", items: { type: "string" } },
        },
        required: ["name", "type"],
      },
      outputSchema: {
        type: "object",
        properties: { analyzer: { type: "object", additionalProperties: true } },
        required: ["analyzer"],
      },
    },
    {
      name: API_TOOLS.LIST_GRAPHS,
      description: "List named ArangoDB graphs.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: { graphs: { type: "array", items: { type: "object", additionalProperties: true } } },
        required: ["graphs"],
      },
    },
    {
      name: API_TOOLS.CREATE_GRAPH,
      description: "Create a named graph with one edge definition.",
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
          edgeCollection: collectionNameSchema,
          fromCollections: { type: "array", items: collectionNameSchema, minItems: 1 },
          toCollections: { type: "array", items: collectionNameSchema, minItems: 1 },
        },
        required: ["name", "edgeCollection", "fromCollections", "toCollections"],
      },
      outputSchema: {
        type: "object",
        properties: { graph: { type: "object", additionalProperties: true } },
        required: ["graph"],
      },
    },
    {
      name: API_TOOLS.TRAVERSE,
      description: "Traverse graph edges from a start vertex using AQL traversal syntax.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          startVertex: { type: "string", minLength: 1 },
          edgeCollection: {
            ...collectionNameSchema,
            description: "Edge collection for anonymous graph traversal. Provide this or graph.",
          },
          graph: {
            ...collectionNameSchema,
            description: "Named graph to traverse. Provide this or edgeCollection.",
          },
          direction: { type: "string", enum: ["OUTBOUND", "INBOUND", "ANY"], default: "OUTBOUND" },
          minDepth: { type: "integer", minimum: 0, maximum: 10, default: 1 },
          maxDepth: { type: "integer", minimum: 1, maximum: 10, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
          order: { type: "string", enum: ["dfs", "bfs", "weighted"] },
          uniqueVertices: { type: "string", enum: ["none", "path", "global"] },
          uniqueEdges: { type: "string", enum: ["none", "path"] },
          weightAttribute: { type: "string", minLength: 1 },
          defaultWeight: { type: "number", minimum: 0 },
        },
        required: ["startVertex"],
      },
      outputSchema: {
        type: "object",
        properties: { rows: { type: "array", items: {} }, count: { type: "integer" } },
        required: ["rows", "count"],
      },
    },
    {
      name: API_TOOLS.SHORTEST_PATH,
      description: "Find the shortest path between two vertices through an edge collection.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          startVertex: { type: "string", minLength: 1 },
          targetVertex: { type: "string", minLength: 1 },
          edgeCollection: {
            ...collectionNameSchema,
            description: "Edge collection for anonymous graph shortest path. Provide this or graph.",
          },
          graph: {
            ...collectionNameSchema,
            description: "Named graph for shortest path. Provide this or edgeCollection.",
          },
          direction: { type: "string", enum: ["OUTBOUND", "INBOUND", "ANY"], default: "OUTBOUND" },
          weightAttribute: { type: "string", minLength: 1 },
          defaultWeight: { type: "number", minimum: 0 },
        },
        required: ["startVertex", "targetVertex"],
      },
      outputSchema: {
        type: "object",
        properties: { rows: { type: "array", items: {} }, count: { type: "integer" } },
        required: ["rows", "count"],
      },
    },
    {
      name: API_TOOLS.INSERT_EDGE,
      description: "Insert an edge document with _from and _to into an edge collection.",
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
          from: { type: "string", minLength: 1 },
          to: { type: "string", minLength: 1 },
          document: objectSchema,
        },
        required: ["collection", "from", "to"],
      },
      outputSchema: {
        type: "object",
        properties: { document: metadataSchema },
        required: ["document"],
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
  READ_QUERY = "arango_read_query",
  VALIDATE_QUERY = "arango_validate_query",
  EXPLAIN_QUERY = "arango_explain_query",
  INSERT = "arango_insert",
  BULK_INSERT = "arango_bulk_insert",
  INSERT_EDGE = "arango_insert_edge",
  UPDATE = "arango_update",
  BULK_UPDATE = "arango_bulk_update",
  REMOVE = "arango_remove",
  BACKUP = "arango_backup",
  COLLECTIONS = "arango_list_collections",
  DESCRIBE_DATABASE = "arango_describe_database",
  GET_COLLECTION = "arango_get_collection",
  GET_DOCUMENT = "arango_get_document",
  LIST_DOCUMENTS = "arango_list_documents",
  COUNT_DOCUMENTS = "arango_count_documents",
  SAMPLE_DOCUMENTS = "arango_sample_documents",
  CREATE_COLLECTION = "arango_create_collection",
  DROP_COLLECTION = "arango_drop_collection",
  LIST_INDEXES = "arango_list_indexes",
  CREATE_INDEX = "arango_create_index",
  LIST_VIEWS = "arango_list_views",
  CREATE_SEARCH_VIEW = "arango_create_search_view",
  SEARCH = "arango_search",
  LIST_ANALYZERS = "arango_list_analyzers",
  CREATE_ANALYZER = "arango_create_analyzer",
  LIST_GRAPHS = "arango_list_graphs",
  CREATE_GRAPH = "arango_create_graph",
  TRAVERSE = "arango_traverse",
  SHORTEST_PATH = "arango_shortest_path",
}
