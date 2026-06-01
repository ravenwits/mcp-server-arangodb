# MCP Server for ArangoDB

[<img src="./assets/cover.webp" width="420" alt="ArangoDB MCP Server"/>](./assets/cover.webp)

A Model Context Protocol server for [ArangoDB](https://arango.ai/products/arangodb)

This is a TypeScript-based MCP server that provides database interaction capabilities through ArangoDB. It implements core database operations and allows seamless integration with ArangoDB through MCP tools. You can use it wih Claude app and also extension for VSCode that works with mcp like Cline!

## Features

### Tools

- `arango_query` - Execute AQL queries

  - Takes an AQL query string as required parameter
  - Optionally accepts bind variables for parameterized queries
  - Accepts an optional `limit` parameter, capped at 1000 rows
  - Returns query results as JSON text and structured MCP content

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

  - Writes only under `ARANGO_BACKUP_ROOT` to prevent arbitrary file writes
  - Accepts only a safe relative `outputDir` name, such as `nightly_1`
  - Creates JSON files for each collection with current data and refuses to overwrite existing files
  - Useful for data backup and migration purposes

- `arango_list_collections` - List all collections in the database

  - Returns array of collection information including names, IDs, and types

- `arango_create_collection` - Create a new collection in the database
  - Takes collection name as required parameter
  - Optionally specify collection type (document or edge collection)
  - Configure waitForSync behavior for write operations
  - Returns collection information including name, type, and status

- `arango_drop_collection` - Drop an existing collection from the database
  - Takes collection name as required parameter
  - Requires `confirm: true` to reduce accidental destructive calls
  - Permanently removes the collection and its documents
  - Returns the dropped collection name and status

## Installation

### Installing via NPM

To install `arango-server` globally via NPM, run the following command:

```bash
npm install -g arango-server
```

### Running via NPX

To run `arango-server` directly without installation, use the following command:

```bash
npx arango-server
```

### Configuring for VSCode Agent

To use `arango-server` with the VSCode Copilot agent, you must have at least **VSCode 1.99.0 installed** and follow these steps:

1. **Create or edit the MCP configuration file**:

   - **Workspace-specific configuration**: Create or edit the `.vscode/mcp.json` file in your workspace.
   - **User-specific configuration**: Optionally, specify the server in the [setting(mcp)](vscode://settings/mcp) VS Code [user settings](https://code.visualstudio.com/docs/getstarted/personalize-vscode#_configure-settings) to enable the MCP server across all workspaces.

     _Tip: You can refer [here](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) to the MCP configuration documentation of VSCode for more details on how to set up the configuration file._

2. **Add the following configuration**:

   ```json
   {
     "servers": {
       "arango-mcp": {
         "type": "stdio",
         "command": "npx",
         "args": ["arango-server"],
         "env": {
           "ARANGO_URL": "http://localhost:8529",
           "ARANGO_DB": "your_database_name",
           "ARANGO_USERNAME": "your_username",
           "ARANGO_PASSWORD": "your_password"
         }
       }
     }
   }
   ```

3. **Start the MCP server**:

   - Open the Command Palette in VSCode (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
   - Run the command `MCP: Start Server` and select `arango-mcp` from the list.

4. **Verify the server**:
   - Open the Chat view in VSCode and switch to Agent mode.
   - Use the `Tools` button to verify that the `arango-server` tools are available.

#### To use with Claude Desktop

Go to: `Settings > Developer > Edit Config` or

- MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

You can check out mcp [documentation](https://modelcontextprotocol.io/docs/develop/connect-local-servers) to set it up too.

#### To use with Cline VSCode Extension

Go to: `Cline Extension > MCP Servers > Edit Configuration` or

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
        "ARANGO_DB": "your_database_name",
        "ARANGO_USERNAME": "your_username",
        "ARANGO_PASSWORD": "your_password"
      }
    }
  }
}
```

You can also use the above configuration to get this server working with [WARP](https://docs.warp.dev/knowledge-and-collaboration/mcp)
### Environment Variables

The server requires the following environment variables:

- `ARANGO_URL` - ArangoDB server URL (note: 8529 is the default port for ArangoDB for local development)
- `ARANGO_DB` - Database name
- `ARANGO_USERNAME` - Database user
- `ARANGO_PASSWORD` - Database password
- `ARANGO_BACKUP_ROOT` - Optional root directory for `arango_backup` output. Defaults to `./backups`.

## Usage

You can pretty much provide any meaningful prompt and Claude will try to execute the appropriate function.

Some example propmts:

- "List all collections in the database"
- "Query all users"
- "Insert a new document with name 'John Doe' and email "<john@example.com>' to the 'users' collection"
- "Update the document with key '123456' or name 'Jane Doe' to change the age to 48"
- "Create a new collection named 'products'"

### Usage with Claude App

![Demo of using ArangoDB MCP server with Claude App](./assets/demo-claude.gif)

### Uasge with Cline VSCode extension

![Demo of using ArangoDB MCP server with Cline VSCode extension](./assets/demo-cline.gif)

Query all users:

```typescript
{
  "query": "FOR user IN users RETURN user",
  "limit": 100
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
{
} // No parameters required
```

Backup database collections:

```typescript
{
  "outputDir": "nightly_1", // Safe subdirectory name under ARANGO_BACKUP_ROOT. Absolute paths and slashes are rejected.
  "collection": "users", // Optional. If omitted, all collections are backed up.
  "docLimit": 1000 // Optional. Maximum documents per collection. Defaults to 1000 and is capped at 10000.
}
```

Set `ARANGO_BACKUP_ROOT` to choose where backups are stored. The server rejects path traversal, absolute paths, symlink escapes, and existing output files to mitigate arbitrary file write risks.

Create a new collection:

```typescript
{
  "name": "products",
  "type": "document", // "document" or "edge" (optional, defaults to "document")
  "waitForSync": false // Optional, defaults to false
}
```

Drop a collection:

```typescript
{
  "name": "products",
  "confirm": true
}
```

Note: The server is database-structure agnostic and can work with any collection names or structures as long as they follow ArangoDB's document and edge collection models.

## Disclaimer

### For Development Use Only

This tool is designed for local development environments only. While technically it could connect to a production database, this would create significant security risks and is explicitly discouraged. We use it exclusively with our development databases to maintain separation of concerns and protect production data.

## Development

1. Clone the repository
2. Install dependencies:

   ```bash
   npm run build
   ```

3. For development with auto-rebuild:

   ```bash
   npm run watch
   ```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. recommended debugging can be done by using [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for development:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

### Testing

```bash
npm test
```

The test suite includes regression coverage for the `arango_backup` path handling that prevents absolute paths, traversal, and symlink escapes.

To run the integration smoke test with a local Docker ArangoDB instance:

```bash
npm run test:integration
```

The integration test starts a temporary Docker ArangoDB instance, starts the MCP server over stdio, lists tools, verifies `outputSchema`, creates a temporary collection, inserts documents, queries with `limit`, verifies backup output stays under `ARANGO_BACKUP_ROOT`, rejects an absolute backup path, cleans up the collection, and stops the container.

The test container uses host port `18529` by default to avoid conflicting with a local ArangoDB on `8529`. Override it with `ARANGO_PORT` if needed.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
