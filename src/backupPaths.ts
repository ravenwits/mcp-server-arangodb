import { promises as fs } from "fs";
import { resolve, sep } from "path";

const SAFE_BACKUP_DIR = /^[A-Za-z0-9_-]+$/;

export function getBackupRoot(): string {
  return resolve(process.env.ARANGO_BACKUP_ROOT || "./backups");
}

export function assertSafeBackupDirName(outputDir: string): void {
  if (!SAFE_BACKUP_DIR.test(outputDir)) {
    throw new Error(
      "outputDir must be a single safe relative directory name using letters, numbers, underscores, or hyphens"
    );
  }
}

export async function resolveBackupOutputDir(outputDir: string): Promise<string> {
  assertSafeBackupDirName(outputDir);

  const root = getBackupRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  const realRoot = await fs.realpath(root);

  const target = resolve(realRoot, outputDir);
  if (!target.startsWith(`${realRoot}${sep}`)) {
    throw new Error("Resolved backup directory escapes ARANGO_BACKUP_ROOT");
  }

  await fs.mkdir(target, { recursive: true, mode: 0o750 });
  const realTarget = await fs.realpath(target);
  if (realTarget !== target || !realTarget.startsWith(`${realRoot}${sep}`)) {
    throw new Error("Backup directory must not escape ARANGO_BACKUP_ROOT or use symlinks");
  }

  return realTarget;
}
