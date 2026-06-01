#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Database } from "arangojs";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createToolDefinitions } from "./tools.js";
import { ToolHandlers } from "./handlers.js";

// Get package version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);
const MAX_RECONNECTION_ATTEMPTS = 3;
const RECONNECTION_DELAY = 1000; // 1 second

// Get connection details from environment variables
const ARANGO_URL = process.env.ARANGO_URL || "http://localhost:8529";
const ARANGO_DB = process.env.ARANGO_DB || "_system";
const ARANGO_USERNAME = process.env.ARANGO_USERNAME;
const ARANGO_PASSWORD = process.env.ARANGO_PASSWORD;
const TOOLS = createToolDefinitions();

if (!ARANGO_USERNAME || !ARANGO_PASSWORD) {
  throw new Error(
    "ARANGO_USERNAME and ARANGO_PASSWORD environment variables are required"
  );
}

class ArangoServer {
  private server: Server;
  private isConnected: boolean = false;
  private reconnectionAttempts: number = 0;
  private toolHandlers: ToolHandlers;

  private constructor(private db: Database) {
    // Initialize MCP server
    this.server = new Server(
      {
        name: "arango-server",
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize tool handlers
    this.toolHandlers = new ToolHandlers(
      this.db,
      TOOLS,
      this.ensureConnection.bind(this)
    );

    // Set up request handlers
    this.server.setRequestHandler(ListToolsRequestSchema, () =>
      this.toolHandlers.handleListTools()
    );
    this.server.setRequestHandler(CallToolRequestSchema, (request) =>
      this.toolHandlers.handleCallTool(request)
    );
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  static async create(): Promise<ArangoServer> {
    const instance = new ArangoServer(ArangoServer.createDatabase());
    await instance.initializeDatabase();
    return instance;
  }

  private static createDatabase(): Database {
    const db = new Database([ARANGO_URL]);
    db.useBasicAuth(ARANGO_USERNAME, ARANGO_PASSWORD);
    return db.database(ARANGO_DB);
  }

  private async initializeDatabase() {
    try {
      // Test connection
      await this.checkConnection();
      this.isConnected = true;
      this.reconnectionAttempts = 0;
    } catch (error) {
      await this.handleConnectionError();
    }
  }

  private async checkConnection(): Promise<void> {
    try {
      await this.db.version();
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }

  private async handleConnectionError(): Promise<void> {
    if (this.reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
      throw new Error(
        `Failed to connect after ${MAX_RECONNECTION_ATTEMPTS} attempts`
      );
    }

    this.reconnectionAttempts++;

    await new Promise((resolve) => setTimeout(resolve, RECONNECTION_DELAY));
    this.db = ArangoServer.createDatabase();
    await this.initializeDatabase();
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.handleConnectionError();
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

ArangoServer.create()
  .then((server) => server.run())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
