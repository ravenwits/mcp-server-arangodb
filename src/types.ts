import { z } from "zod";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ])
);

export const collectionNameSchema = z
  .string()
  .min(1)
  .regex(/^_?[A-Za-z][A-Za-z0-9_-]*$/, "Use a valid ArangoDB collection name");

export const identifierSchema = z
  .string()
  .min(1)
  .regex(/^_?[A-Za-z][A-Za-z0-9_-]*$/, "Use a valid ArangoDB identifier");

export const queryArgsSchema = z.object({
  query: z.string().min(1, "AQL query is required"),
  bindVars: z.record(z.string(), jsonValue).optional().default({}),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  memoryLimit: z.number().int().min(0).optional(),
  maxRuntime: z.number().min(0).optional(),
  failOnWarning: z.boolean().optional(),
});

export const readQueryArgsSchema = queryArgsSchema;

export const validateQueryArgsSchema = z.object({
  query: z.string().min(1, "AQL query is required"),
});

export const explainQueryArgsSchema = queryArgsSchema.extend({
  allPlans: z.boolean().optional().default(false),
  maxNumberOfPlans: z.number().int().min(1).max(128).optional().default(1),
});

export const collectionDocumentArgsSchema = z.object({
  collection: collectionNameSchema,
  document: z.record(z.string(), jsonValue),
});

export const bulkInsertArgsSchema = z.object({
  collection: collectionNameSchema,
  documents: z.array(z.record(z.string(), jsonValue)).min(1).max(1000),
  returnNew: z.boolean().optional().default(false),
  overwriteMode: z.enum(["conflict", "ignore", "replace", "update"]).optional(),
  waitForSync: z.boolean().optional(),
});

export const collectionKeyArgsSchema = z.object({
  collection: collectionNameSchema,
  key: z.string().min(1, "Document key is required"),
});

export const collectionArgsSchema = z.object({
  collection: collectionNameSchema,
});

export const listDocumentsArgsSchema = z.object({
  collection: collectionNameSchema,
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
});

export const sampleDocumentsArgsSchema = z.object({
  collection: collectionNameSchema,
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export const updateDocumentArgsSchema = collectionKeyArgsSchema.extend({
  update: z.record(z.string(), jsonValue),
});

export const bulkUpdateArgsSchema = z.object({
  collection: collectionNameSchema,
  documents: z.array(z.record(z.string(), jsonValue)).min(1).max(1000),
  returnNew: z.boolean().optional().default(false),
  returnOld: z.boolean().optional().default(false),
  keepNull: z.boolean().optional(),
  mergeObjects: z.boolean().optional(),
  waitForSync: z.boolean().optional(),
});

export const backupArgsSchema = z.object({
  outputDir: z
    .string()
    .min(1)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Use only a safe relative backup directory name without path separators"
    )
    .optional()
    .default("default"),
  collection: collectionNameSchema.optional(),
  docLimit: z.number().int().min(1).max(10000).optional().default(1000),
});

export const createCollectionArgsSchema = z.object({
  name: collectionNameSchema,
  type: z.enum(["document", "edge"]).optional().default("document"),
  waitForSync: z.boolean().optional().default(false),
});

export const createIndexArgsSchema = z.object({
  collection: collectionNameSchema,
  type: z.enum(["persistent", "geo", "ttl", "inverted"]),
  fields: z.array(z.union([z.string().min(1), z.record(z.string(), jsonValue)])).min(1),
  name: identifierSchema.optional(),
  unique: z.boolean().optional(),
  sparse: z.boolean().optional(),
  inBackground: z.boolean().optional().default(true),
  expireAfter: z.number().int().min(1).optional(),
});

export const searchArgsSchema = z.object({
  view: identifierSchema,
  field: z.string().min(1),
  searchText: z.string().min(1),
  analyzer: z.string().min(1).optional().default("identity"),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export const createSearchViewArgsSchema = z.object({
  name: identifierSchema,
  collection: collectionNameSchema,
  includeAllFields: z.boolean().optional().default(true),
  analyzers: z.array(z.string().min(1)).optional().default(["identity"]),
});

export const createAnalyzerArgsSchema = z.object({
  name: identifierSchema,
  type: z.string().min(1),
  properties: z.record(z.string(), jsonValue).optional().default({}),
  features: z.array(z.string().min(1)).optional(),
});

export const createGraphArgsSchema = z.object({
  name: identifierSchema,
  edgeCollection: collectionNameSchema,
  fromCollections: z.array(collectionNameSchema).min(1),
  toCollections: z.array(collectionNameSchema).min(1),
});

export const traverseArgsSchema = z.object({
  startVertex: z.string().min(1, "Start vertex _id is required"),
  edgeCollection: collectionNameSchema.optional(),
  graph: identifierSchema.optional(),
  direction: z.enum(["OUTBOUND", "INBOUND", "ANY"]).optional().default("OUTBOUND"),
  minDepth: z.number().int().min(0).max(10).optional().default(1),
  maxDepth: z.number().int().min(1).max(10).optional().default(1),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  order: z.enum(["dfs", "bfs", "weighted"]).optional(),
  uniqueVertices: z.enum(["none", "path", "global"]).optional(),
  uniqueEdges: z.enum(["none", "path"]).optional(),
  weightAttribute: z.string().min(1).optional(),
  defaultWeight: z.number().min(0).optional(),
});

export const shortestPathArgsSchema = z.object({
  startVertex: z.string().min(1, "Start vertex _id is required"),
  targetVertex: z.string().min(1, "Target vertex _id is required"),
  edgeCollection: collectionNameSchema.optional(),
  graph: identifierSchema.optional(),
  direction: z.enum(["OUTBOUND", "INBOUND", "ANY"]).optional().default("OUTBOUND"),
  weightAttribute: z.string().min(1).optional(),
  defaultWeight: z.number().min(0).optional(),
});

export const insertEdgeArgsSchema = z.object({
  collection: collectionNameSchema,
  from: z.string().min(1, "Edge _from is required"),
  to: z.string().min(1, "Edge _to is required"),
  document: z.record(z.string(), jsonValue).optional().default({}),
});

export const dropCollectionArgsSchema = z.object({
  name: collectionNameSchema,
  confirm: z.literal(true, {
    error: "Set confirm to true to permanently drop the collection and all documents",
  }),
});

export type BackupArgs = z.infer<typeof backupArgsSchema>;
export type QueryArgs = z.infer<typeof queryArgsSchema>;
export type ReadQueryArgs = z.infer<typeof readQueryArgsSchema>;
export type BulkInsertArgs = z.infer<typeof bulkInsertArgsSchema>;
export type CollectionDocumentArgs = z.infer<typeof collectionDocumentArgsSchema>;
export type CollectionKeyArgs = z.infer<typeof collectionKeyArgsSchema>;
export type UpdateDocumentArgs = z.infer<typeof updateDocumentArgsSchema>;
export type CreateCollectionArgs = z.infer<typeof createCollectionArgsSchema>;
export type DropCollectionArgs = z.infer<typeof dropCollectionArgsSchema>;
