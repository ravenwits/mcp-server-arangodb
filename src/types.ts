import { CollectionType } from 'arangojs/collection';

// Type definitions for request arguments
export interface BackupArgs {
	outputDir: string;
	collection?: string;
	docLimit?: number;
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

export interface CreateCollectionArgs {
	name: string;
	type?: CollectionType; // 2 for document collection, 3 for edge collection
	waitForSync?: boolean;
}
