# MCP Server for ArangoDB

A Model Context Protocol server for ArangoDB

This is a TypeScript-based MCP server that provides database interaction capabilities through ArangoDB. It implements core database operations and allows seamless integration with ArangoDB through MCP tools. You can use it wih Claude app and also extension for VSCode that works with mcp like Cline!

## Features

### Tools

- `query` - Execute AQL queries
  - Takes an AQL query string as required parameter
  - Optionally accepts bind variables for parameterized queries
  - Returns query results as JSON

- `insert` - Insert documents into collections
  - Takes collection name and document object as required parameters
  - Automatically generates document key if not provided
  - Returns the created document metadata

- `update` - Update existing documents
  - Takes collection name, document key, and update object as required parameters
  - Returns the updated document metadata

- `remove` - Remove documents from collections
  - Takes collection name and document key as required parameters
  - Returns the removed document metadata

- `list_collections` - List all collections in the database
  - Returns array of collection information including names, IDs, and types

- `backup_db` - Backup all collections to JSON files
  - Takes output directory path as required parameter
  - Creates JSON files for each collection with current data
  - Useful for data backup and migration purposes

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

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

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

#### Usage with Claude App:
![](./assets/demo-claude.gif)

#### Uasge with Cline VSCode extension:
![](./assets/demo-cline.gif)

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

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for development:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
