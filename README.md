# MCP Server for ArangoDB

A Model Context Protocol server for ArangoDB

This is a TypeScript-based MCP server that provides database interaction capabilities through ArangoDB. It implements core database operations and allows seamless integration with ArangoDB through MCP tools. You can use it wih Claude app and also extension for VSCode that works with mcp like Cline!

## Features

### Tools

- `arango_query` - Execute AQL queries
  - Takes an AQL query string as required parameter
  - Optionally accepts bind variables for parameterized queries
  - Returns query results as JSON

- `arango_insert` - Insert documents into collections
  - Takes collection name and document object as required parameters
  - Automatically generates document key if not provided
  - Returns the created document metadata

- `arango_update` - Update existing documents
  - Takes collection name, document key, and update object as required parameters
  - Returns the updated document metadata

- `arango_remove` - Remove documents from collections
  - Takes collection name and document key as required parameters
  - Returns the removed document metadata

- `arango_backup` - Backup all collections to JSON files
  - Takes output directory path as required parameter
  - Creates JSON files for each collection with current data
  - Useful for data backup and migration purposes

- `arango_list_collections` - List all collections in the database
  - Returns array of collection information including names, IDs, and types

- `arango_create_collection` - Create a new collection in the database
  - Takes collection name as required parameter
  - Optionally specify collection type (document or edge collection)
  - Configure waitForSync behavior for write operations
  - Returns collection information including name, type, and status

## Database Structure

The server is database-structure agnostic and can work with any collection names or structures as long as they follow ArangoDB's document and edge collection models.

## Development

Install dependencies:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

- MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

To use with Cline VSCode Extension, add the server config:

- MacOS: `~/Library/Application Support/Code/User/globalStorage/cline.cline/config.json`
- Windows: `%APPDATA%/Code/User/globalStorage/cline.cline/config.json`

Add the following configuration to the `mcpServers` section:

```json
{
  "mcpServers": {
    "arango": {
      "command": "node",
      "args": ["/path/to/arango-server/build/index.js"],
      "env": {
        "ARANGO_URL": "your_database_url",
        "ARANGO_DATABASE": "your_database_name",
        "ARANGO_USERNAME": "your_username",
        "ARANGO_PASSWORD": "your_password"
      }
    }
  }
}
```

### Environment Variables

The server requires the following environment variables:

- `ARANGO_URL` - ArangoDB server URL (note: 8529 is the default port for ArangoDB for local development)
- `ARANGO_DATABASE` - Database name
- `ARANGO_USERNAME` - Database user
- `ARANGO_PASSWORD` - Database password

### Usage Examples

You can pretty much provide any meaningful prompt and Claude will try to execute the appropriate function.

Some example propmts:

- "List all collections in the database"
- "Query all users"
- "Insert a new document with name 'John Doe' and email "<john@example.com>' to the 'users' collection"
- "Update the document with key '123456' or name 'Jane Doe' to change the age to 48"
- "Create a new collection named 'products'"

#### Usage with Claude App

![Demo of using ArangoDB MCP server with Claude App](./assets/demo-claude.gif)

#### Uasge with Cline VSCode extension

![Demo of using ArangoDB MCP server with Cline VSCode extension](./assets/demo-cline.gif)

Query all users:

```typescript
{
  "query": "FOR user IN users RETURN user"
}
```

Insert a new document:

```typescript
{
  "collection": "users",
  "document": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

Update a document:

```typescript
{
  "collection": "users",
  "key": "123456",
  "update": {
    "name": "Jane Doe"
  }
}
```

Remove a document:

```typescript
{
  "collection": "users",
  "key": "123456"
}
```

List all collections:

```typescript
{} // No parameters required
```

Backup database collections:

```typescript
{
  "outputDir": "./backup" // Specify an absolute output directory path for the backup files (optional)
  "collection": "users" // Specify a collection name to backup (optional) If no collection name is provided, all collections will be backed up
  "docLimit": 1000 // Specify the maximum number of documents to backup per collection (optional), if not provided, all documents will be backed up (not having a limit might cause timeout for large collections)
}
```

Create a new collection:

```typescript
{
  "name": "products",
  "type": 2, // 2 for document collection, 3 for edge collection (optional, defaults to document collection)
  "waitForSync": false // Optional, defaults to false
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for development:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
