import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { test } from "node:test";
import {
  assertSafeBackupDirName,
  resolveBackupOutputDir,
} from "./backupPaths.js";

test("rejects unsafe backup directory names", () => {
  assert.throws(() => assertSafeBackupDirName("/tmp/backup"), /outputDir/);
  assert.throws(() => assertSafeBackupDirName("../backup"), /outputDir/);
  assert.throws(() => assertSafeBackupDirName("nested/backup"), /outputDir/);
});

test("resolves backup output inside ARANGO_BACKUP_ROOT", async () => {
  const previousRoot = process.env.ARANGO_BACKUP_ROOT;
  const root = await fs.mkdtemp(join(tmpdir(), "arango-backup-root-"));
  process.env.ARANGO_BACKUP_ROOT = root;

  try {
    const outputDir = await resolveBackupOutputDir("nightly_1");
    assert.equal(outputDir, join(root, "nightly_1"));
    assert.ok(outputDir.startsWith(`${root}${sep}`));
  } finally {
    if (previousRoot === undefined) {
      delete process.env.ARANGO_BACKUP_ROOT;
    } else {
      process.env.ARANGO_BACKUP_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects symlinked backup output directories", async () => {
  const previousRoot = process.env.ARANGO_BACKUP_ROOT;
  const root = await fs.mkdtemp(join(tmpdir(), "arango-backup-root-"));
  const outside = await fs.mkdtemp(join(tmpdir(), "arango-backup-outside-"));
  process.env.ARANGO_BACKUP_ROOT = root;

  try {
    await fs.symlink(outside, join(root, "linked"));
    await assert.rejects(() => resolveBackupOutputDir("linked"), /symlinks/);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.ARANGO_BACKUP_ROOT;
    } else {
      process.env.ARANGO_BACKUP_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
