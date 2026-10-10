#!/usr/bin/env node
/**
 * Orphaned local upload sweep (P2-10).
 *
 * Every locally stored asset must be addressable through a `media` row: the row is what
 * `/api/media/[id]` looks up. A file on disk that no row points at can never be served,
 * listed in the media library or deleted through the admin UI — it is pure dead weight,
 * usually left behind by a crashed deploy, a failed rollback or a disk-level restore.
 *
 * This script reports (and with --delete removes) those files.
 *
 * Safety rules:
 *  - only the configured local upload directory is ever touched, symlinks are skipped;
 *  - a file is only considered orphaned when *no* media row uses its storage key;
 *  - files newer than the grace window are kept, so an upload that is mid-flight (stored,
 *    row not committed yet) can never be removed;
 *  - remote providers (Cloudinary / object storage) are out of scope by definition: only
 *    local files live in this directory.
 *
 * Usage:
 *   node scripts/cleanup-orphan-uploads.mjs                     # dry run (default)
 *   node scripts/cleanup-orphan-uploads.mjs --delete            # remove orphans
 *   node scripts/cleanup-orphan-uploads.mjs --older-than-minutes=60
 *   node scripts/cleanup-orphan-uploads.mjs --json              # machine readable summary
 */
import "dotenv/config";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const shouldDelete = flag("delete");
const asJson = flag("json");
const graceMinutes = Math.max(0, Number(value("older-than-minutes", "15")) || 0);
const uploadDir = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR ?? ".uploads");
const databaseUrl = process.env.DATABASE_URL;

const log = (...parts) => {
  if (!asJson) console.log(...parts);
};

if (!databaseUrl) {
  console.error("DATABASE_URL is required: the sweep must know which files are still referenced.");
  process.exit(1);
}

/** Every storage key a media row can serve, for the local provider only. */
async function referencedStorageKeys() {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query(
      "select storage_key from media where provider = 'local' and storage_key <> ''",
    );
    return new Set(result.rows.map((row) => String(row.storage_key)));
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Recursively lists regular files below `dir`, skipping symlinks and escaping paths. */
async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found; // directory does not exist: nothing to sweep
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(uploadDir, full);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue; // never leave the upload dir
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      found.push(...(await walk(full)));
      continue;
    }
    if (!entry.isFile()) continue;
    found.push({ full, relative });
  }
  return found;
}

const referenced = await referencedStorageKeys();
const files = await walk(uploadDir);
const cutoff = Date.now() - graceMinutes * 60 * 1000;

const orphans = [];
let keptReferenced = 0;
let keptRecent = 0;

for (const file of files) {
  const key = file.relative.split(path.sep).join("/");
  if (referenced.has(key)) {
    keptReferenced += 1;
    continue;
  }
  const info = await stat(file.full).catch(() => null);
  if (!info) continue;
  if (info.mtimeMs > cutoff) {
    keptRecent += 1;
    log(`keep (newer than ${graceMinutes}m) ${key}`);
    continue;
  }
  orphans.push({ key, path: file.full, size: info.size, mtime: new Date(info.mtimeMs).toISOString() });
}

let deleted = 0;
let reclaimedBytes = 0;
const failures = [];

for (const orphan of orphans) {
  if (!shouldDelete) {
    log(`orphan ${orphan.key} (${orphan.size} bytes, modified ${orphan.mtime})`);
    continue;
  }
  try {
    await unlink(orphan.path);
    deleted += 1;
    reclaimedBytes += orphan.size;
    log(`deleted ${orphan.key}`);
  } catch (error) {
    failures.push({ key: orphan.key, error: error instanceof Error ? error.message : String(error) });
    log(`failed ${orphan.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const summary = {
  uploadDir,
  mode: shouldDelete ? "delete" : "dry-run",
  graceMinutes,
  scanned: files.length,
  referenced: keptReferenced,
  keptRecent,
  orphans: orphans.length,
  deleted,
  reclaimedBytes,
  failures,
  orphanKeys: orphans.map((o) => o.key),
};

if (asJson) console.log(JSON.stringify(summary, null, 2));
else {
  log("");
  log(
    `ORPHAN_SWEEP scanned=${summary.scanned} referenced=${summary.referenced} ` +
      `recent=${summary.keptRecent} orphans=${summary.orphans} deleted=${summary.deleted} ` +
      `reclaimed=${summary.reclaimedBytes}B mode=${summary.mode}`,
  );
  if (!shouldDelete && summary.orphans) log("Re-run with --delete to remove them.");
}

process.exitCode = failures.length ? 1 : 0;
