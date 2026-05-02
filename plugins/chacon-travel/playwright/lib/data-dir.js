import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default: <plugin-root>/data — keeps everything inside the plugin install
// directory so user projects stay clean.
//   plugins/chacon-travel/playwright/lib/data-dir.js  →  plugins/chacon-travel/data
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_DIR = path.join(PLUGIN_ROOT, 'data');

// User-home fallback for read-only plugin installs (e.g. system-managed).
const HOME_FALLBACK = path.join(os.homedir(), '.claude', 'chacon-travel', 'data');

function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-test');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  const explicit = process.env.CHACON_TRAVEL_DATA_DIR || process.env.TRAVEL_PLANS_DIR;
  if (explicit) return path.resolve(explicit);
  if (isWritable(DEFAULT_DIR)) return DEFAULT_DIR;
  return HOME_FALLBACK;
}

export const DATA_DIR = resolveDataDir();
