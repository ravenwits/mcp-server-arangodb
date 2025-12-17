FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts

COPY . .
RUN npm run build

# MCP servers communicate via stdio, not HTTP ports
# Environment variables must be provided at runtime:
# ARANGO_URL, ARANGO_DB, ARANGO_USERNAME, ARANGO_PASSWORD

# Run the server
ENTRYPOINT ["node", "build/index.js"]
