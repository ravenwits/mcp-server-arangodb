# Privacy Policy for MCP Server ArangoDB

**Last Updated:** December 17, 2024

## Overview

This Privacy Policy describes how the MCP Server for ArangoDB ("the Software") handles data when you use it.

## Developer Information

**Developer:** Alp Sarıyer  
**Contact:** hi@alpsariyer.dev  
**Repository:** https://github.com/ravenwits/mcp-server-arangodb

## Data Collection and Usage

### What Data is Processed

The MCP Server for ArangoDB processes the following types of data:

1. **Database Connection Information:**
   - ArangoDB URL
   - Database name
   - Authentication credentials (username and password)
   - These are provided by you via environment variables and stored only in your local environment

2. **Database Content:**
   - Documents and collections in your ArangoDB database
   - AQL queries you execute through Claude
   - All database operations you request (inserts, updates, deletes, backups)

### How Data is Used

- **Local Processing Only:** All data is processed locally on your machine. The server runs as a local process and communicates directly with your ArangoDB instance.
- **No External Transmission:** The Software does not send any data to external servers, third parties, or remote services beyond your configured ArangoDB instance.
- **No Analytics or Tracking:** The Software does not collect analytics, telemetry, or usage statistics.
- **No Logging of Sensitive Data:** Database credentials and query content are not logged or stored by the Software beyond what is necessary for immediate execution.

### Data Storage

- **Environment Variables:** Connection credentials are stored in environment variables on your local machine.
- **Backup Files:** When you use the backup functionality, database collections are exported to JSON files in a directory you specify on your local file system.
- **No Cloud Storage:** The Software does not store any data in cloud services or remote locations.

## Data Sharing

The MCP Server for ArangoDB does not share your data with any third parties. All data operations are:
- Executed locally on your machine
- Transmitted only between the MCP server and your ArangoDB instance
- Never sent to external services, APIs, or third-party platforms

## Security

### Your Responsibilities

- **Credential Security:** You are responsible for securing your ArangoDB credentials and environment variables.
- **Access Control:** Ensure appropriate file system permissions for backup files and configuration files.
- **Network Security:** If your ArangoDB instance is accessible over a network, ensure proper network security measures are in place.

### Software Security

- **Secure Communication:** The Software uses the arangojs official driver for secure communication with ArangoDB.
- **No Credential Storage:** Credentials are only read from environment variables at runtime and are not persisted by the Software.
- **Input Validation:** All user inputs are validated before being sent to the database.

## User Rights

Since all data is processed and stored locally by you:

- **Full Control:** You have complete control over all data the Software processes.
- **Data Deletion:** You can delete any data by removing files from your file system or deleting records from your ArangoDB instance.
- **No Account:** The Software does not create accounts or maintain user profiles.

## Third-Party Services

The Software connects to:

1. **Your ArangoDB Instance:** As configured by you via environment variables.
2. **Claude/Anthropic Services:** When used as an MCP server with Claude, interactions are governed by Anthropic's privacy policy.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the repository with an updated "Last Updated" date. Continued use of the Software after changes constitutes acceptance of the updated policy.

## Open Source

This Software is open source under the MIT License. You can review the source code at:
https://github.com/ravenwits/mcp-server-arangodb

## Contact

For privacy-related questions or concerns, please contact:
- **Email:** hi@alpsariyer.dev
- **GitHub Issues:** https://github.com/ravenwits/mcp-server-arangodb/issues

## Compliance

This Software:
- Does not collect personal data beyond what is necessary for database operations
- Does not use cookies or tracking technologies
- Does not engage in profiling or automated decision-making
- Operates entirely locally without external data transmission
