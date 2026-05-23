/**
 * @file stage.js
 * @description Runtime-dev staging pipeline for OptiRoute Pro.
 *
 * Builds the `runtime-dev/` directory at the project root, simulating
 * the installed application runtime structure during development.
 *
 * This script:
 *   1. Removes any existing `runtime-dev/` directory safely.
 *   2. Recreates the canonical runtime directory structure.
 *   3. Copies installed data payloads from `installed/SetupTool/data/`.
 *   4. Stages backend runtime files into `runtime-dev/resources/server/`.
 *   5. Stages the frontend build output into `runtime-dev/resources/server/frontend/dist/`.
 *   6. Prepares simulation directories for AppData-like folders.
 *
 * Usage:
 *   node scripts/stage-runtime-dev/stage.js [--skip-frontend-build]
 *
 * Flags:
 *   --skip-frontend-build   Skip rebuilding the frontend; only copy existing
 *                           dist/ if it exists.
 *
 * @author OptiRoute Team
 * @since 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

/** @type {string} Project root directory (two levels up from this script). */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** @type {string} Runtime-dev output directory. */
const RUNTIME_DEV = path.join(PROJECT_ROOT, 'runtime-dev');

/** @type {string} Installed payload source directory. */
const INSTALLED_ROOT = path.join(PROJECT_ROOT, 'installed', 'SetupTool');

/** @type {string} Development server source directory. */
const SERVER_SRC = path.join(PROJECT_ROOT, 'resources', 'server');


// ---------------------------------------------------------------------------
// Runtime-dev directory structure definition
// ---------------------------------------------------------------------------

/**
 * Canonical runtime-dev subdirectories.
 * These mirror the expected installed runtime filesystem.
 *
 * `resources/` acts as a container for runtime components (server, and
 * future components like the agent app). It is NOT a mirror of
 * `installed/SetupTool/resources/`.
 *
 * @type {string[]}
 */
const RUNTIME_DIRS = [
  'resources/server',
  'runtime',
  'core',
  'localAppData',
  'roamingAppData',
];

// ---------------------------------------------------------------------------
// Backend files to stage (runtime-relevant only)
// ---------------------------------------------------------------------------

/**
 * Files and directories within `resources/server/` that constitute the
 * runtime backend. Source-only artifacts (tests, build logs, raw frontend
 * source, seed scripts) are intentionally excluded.
 *
 * @type {string[]}
 */
const SERVER_RUNTIME_ENTRIES = [
  'server.js',
  'package.json',
  'package-lock.json',
  'ecosystem.config.js',
  'vercel.json',
  '.env.example',
  'config',
  'models',
  'services',
  'routingStrategies',
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Log a styled status message to stdout.
 *
 * @param {'info'|'success'|'warn'|'error'} level - Severity level.
 * @param {string} message - Message to display.
 */
function log(level, message) {
  const prefixes = {
    info: '[INFO]   ',
    success: '[OK]     ',
    warn: '[WARN]   ',
    error: '[ERROR]  ',
  };
  const prefix = prefixes[level] || '[LOG]    ';
  console.log(`${prefix} ${message}`);
}

/**
 * Recursively remove a directory if it exists.
 *
 * @param {string} dirPath - Absolute path to remove.
 */
function removeDirSafe(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Ensure a directory exists, creating it and any parents if necessary.
 *
 * @param {string} dirPath - Absolute path to create.
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Copy a file or directory from source to destination.
 * Directories are copied recursively. Filters out `node_modules/` and `.env`
 * from any copied tree.
 *
 * @param {string} src - Absolute source path.
 * @param {string} dest - Absolute destination path.
 */
function copyFiltered(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      // Skip development-only artifacts that must not leak into runtime
      if (entry === 'node_modules' || entry === '.env') {
        continue;
      }
      copyFiltered(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// Staging steps
// ---------------------------------------------------------------------------

/**
 * Step 1: Remove existing runtime-dev directory.
 */
function cleanRuntimeDev() {
  log('info', 'Cleaning existing runtime-dev/ ...');
  removeDirSafe(RUNTIME_DEV);
  log('success', 'Cleaned runtime-dev/');
}

/**
 * Step 2: Create the canonical runtime-dev directory structure.
 */
function createStructure() {
  log('info', 'Creating runtime-dev/ directory structure ...');
  ensureDir(RUNTIME_DEV);

  for (const dir of RUNTIME_DIRS) {
    ensureDir(path.join(RUNTIME_DEV, dir));
  }

  log('success', 'Directory structure created');
}

/**
 * Step 3: Copy installed data payloads from installed/SetupTool/.
 *
 * Copies `installed/SetupTool/data/` → `runtime-dev/localAppData/data/`.
 */
function stageInstalledData() {
  log('info', 'Staging installed data from installed/SetupTool/ ...');

  const installedData = path.join(INSTALLED_ROOT, 'data');

  // Copy data directory into localAppData simulation
  if (fs.existsSync(installedData)) {
    copyFiltered(installedData, path.join(RUNTIME_DEV, 'localAppData', 'data'));
    log('success', 'Staged installed/SetupTool/data/ → runtime-dev/localAppData/data/');
  } else {
    log('warn', 'installed/SetupTool/data/ not found — skipping');
  }
}

/**
 * Step 4: Stage backend runtime files into runtime-dev/resources/server/.
 *
 * Only copies files listed in {@link SERVER_RUNTIME_ENTRIES}, excluding
 * tests, seed scripts, raw frontend source, build logs, and node_modules.
 */
function stageBackend() {
  log('info', 'Staging backend runtime into runtime-dev/resources/server/ ...');

  const serverDest = path.join(RUNTIME_DEV, 'resources', 'server');

  for (const entry of SERVER_RUNTIME_ENTRIES) {
    const src = path.join(SERVER_SRC, entry);

    if (!fs.existsSync(src)) {
      log('warn', `Backend entry not found: ${entry} — skipping`);
      continue;
    }

    copyFiltered(src, path.join(serverDest, entry));
  }

  // Copy .env.example as .env for runtime-dev (development convenience)
  const envExampleSrc = path.join(SERVER_SRC, '.env.example');
  const envDest = path.join(serverDest, '.env');
  if (fs.existsSync(envExampleSrc) && !fs.existsSync(envDest)) {
    fs.copyFileSync(envExampleSrc, envDest);
    log('success', 'Created runtime-dev/resources/server/.env from .env.example');
  }

  log('success', 'Backend runtime staged');
}

/**
 * Step 6: Install production-only backend dependencies in runtime-dev.
 */
function installServerDeps() {
  const serverDest = path.join(RUNTIME_DEV, 'resources', 'server');
  const packageJson = path.join(serverDest, 'package.json');

  if (!fs.existsSync(packageJson)) {
    log('warn', 'No package.json in runtime-dev/resources/server/ — skipping npm install');
    return;
  }

  log('info', 'Installing production backend dependencies in runtime-dev/resources/server/ ...');
  execSync('npm install --omit=dev', {
    cwd: serverDest,
    stdio: 'inherit',
  });
  log('success', 'Backend dependencies installed');
}

/**
 * Step 7: Write a runtime manifest for traceability.
 *
 * Creates a `runtime-dev/.manifest.json` with staging metadata so that
 * consumers can verify when and how the runtime was staged.
 */
function writeManifest() {
  const manifest = {
    stagedAt: new Date().toISOString(),
    stagedFrom: {
      installedPayload: INSTALLED_ROOT,
      serverSource: SERVER_SRC,
    },
    structure: RUNTIME_DIRS,
    serverEntries: SERVER_RUNTIME_ENTRIES,
    note: 'This directory is auto-generated. Do not edit manually.',
  };

  const manifestPath = path.join(RUNTIME_DEV, '.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  log('success', 'Wrote runtime-dev/.manifest.json');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Execute the full staging pipeline.
 */
function main() {
  const args = process.argv.slice(2);

  console.log('');
  console.log('=========================================');
  console.log('  OptiRoute Runtime-Dev Staging Pipeline');
  console.log('=========================================');
  console.log('');

  const startTime = Date.now();

  try {
    cleanRuntimeDev();
    createStructure();
    stageInstalledData();
    stageBackend();
    installServerDeps();
    writeManifest();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    log('success', `Staging complete in ${elapsed}s`);
    console.log('');
    console.log('  Runtime-dev directory: runtime-dev/');
    console.log('  To start the server:   cd runtime-dev/resources/server && node server.js');
    console.log('');
  } catch (err) {
    log('error', `Staging failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
