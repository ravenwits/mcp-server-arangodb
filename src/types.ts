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

export const queryArgsSchema = z.object({
  query: z.string().min(1, "AQL query is required"),
  bindVars: z.record(z.string(), jsonValue).optional().default({}),
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

export const collectionDocumentArgsSchema = z.object({
  collection: collectionNameSchema,
  document: z.record(z.string(), jsonValue),
});

export const collectionKeyArgsSchema = z.object({
  collection: collectionNameSchema,
  key: z.string().min(1, "Document key is required"),
});

export const updateDocumentArgsSchema = collectionKeyArgsSchema.extend({
  update: z.record(z.string(), jsonValue),
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

export const dropCollectionArgsSchema = z.object({
  name: collectionNameSchema,
  confirm: z.literal(true, {
    error: "Set confirm to true to permanently drop the collection and all documents",
  }),
});

export type BackupArgs = z.infer<typeof backupArgsSchema>;
export type QueryArgs = z.infer<typeof queryArgsSchema>;
export type CollectionDocumentArgs = z.infer<typeof collectionDocumentArgsSchema>;
export type CollectionKeyArgs = z.infer<typeof collectionKeyArgsSchema>;
export type UpdateDocumentArgs = z.infer<typeof updateDocumentArgsSchema>;
export type CreateCollectionArgs = z.infer<typeof createCollectionArgsSchema>;
export type DropCollectionArgs = z.infer<typeof dropCollectionArgsSchema>;
