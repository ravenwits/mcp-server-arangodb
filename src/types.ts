// Type definitions for request arguments
export interface BackupArgs {
	outputDir: string;
}

export interface QueryArgs {
	query: string;
	bindVars?: Record<string, unknown>;
}

export interface CollectionDocumentArgs {
	collection: string;
	document: Record<string, unknown>;
}

export interface CollectionKeyArgs {
	collection: string;
	key: string;
}

export interface UpdateDocumentArgs extends CollectionKeyArgs {
	update: Record<string, unknown>;
}