#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${ARANGO_TEST_CONTAINER:-mcp-arango-test}"
ARANGO_IMAGE="${ARANGO_TEST_IMAGE:-arangodb:3.12}"
ARANGO_PORT="${ARANGO_PORT:-18529}"
ARANGO_PASSWORD="${ARANGO_PASSWORD:-testpass}"

cleanup() {
  docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

if docker ps --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  echo "Container ${CONTAINER_NAME} is already running. Stop it or set ARANGO_TEST_CONTAINER to a different name." >&2
  exit 1
fi

docker run -d --rm \
  --name "${CONTAINER_NAME}" \
  -e "ARANGO_ROOT_PASSWORD=${ARANGO_PASSWORD}" \
  -p "${ARANGO_PORT}:8529" \
  "${ARANGO_IMAGE}" >/dev/null

echo "Waiting for ArangoDB on http://127.0.0.1:${ARANGO_PORT}..."
for _ in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" arangosh \
    --server.endpoint tcp://127.0.0.1:8529 \
    --server.username root \
    --server.password "${ARANGO_PASSWORD}" \
    --javascript.execute-string "db._version()" >/dev/null 2>&1 && \
    ARANGO_PORT="${ARANGO_PORT}" ARANGO_PASSWORD="${ARANGO_PASSWORD}" node -e '
      const auth = Buffer.from(`root:${process.env.ARANGO_PASSWORD}`).toString("base64");
      fetch(`http://127.0.0.1:${process.env.ARANGO_PORT}/_api/version`, {
        headers: { Authorization: `Basic ${auth}` }
      }).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));
    '; then
    sleep 5
    ARANGO_URL="http://127.0.0.1:${ARANGO_PORT}" \
    ARANGO_DB="_system" \
    ARANGO_USERNAME="root" \
    ARANGO_PASSWORD="${ARANGO_PASSWORD}" \
      npm run build && \
    ARANGO_URL="http://127.0.0.1:${ARANGO_PORT}" \
    ARANGO_DB="_system" \
    ARANGO_USERNAME="root" \
    ARANGO_PASSWORD="${ARANGO_PASSWORD}" \
      node scripts/integration-smoke.mjs
    exit 0
  fi
  sleep 1
done

echo "ArangoDB did not become ready in time." >&2
docker logs "${CONTAINER_NAME}" >&2 || true
exit 1
