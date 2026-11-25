import AdmZip from 'adm-zip';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { store } from '../db/store';

const execFileAsync = promisify(execFile);

const MAX_ZIP_ENTRIES = 10_000;
const MAX_UNCOMPRESSED_BYTES = 350 * 1024 * 1024; // 350 MB

const PROTECTED_TOP_SEGMENTS = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.git',
  'node_modules',
  'data',
  'uploads',
  'storage',
  'muztalk-persistent-data',
  'tmp',
]);

const KNOWN_APP_TOP_DIRS = new Set([
  'src',
  'dist',
  'public',
  'database',
  'android',
  'scripts',
  'documentation',
  'mobile',
  'infrastructure',
  'tests',
  'public_html',
]);

export interface ZipUpdateResult {
  ok: boolean;
  extractedFilesCount: number;
  skippedProtectedCount: number;
  strippedRootFolder: string | null;
  hasDist: boolean;
  hasServerJs: boolean;
  buildRan: boolean;
  buildOutput: string | null;
  syncedPublicHtml: boolean;
  restartTriggered: boolean;
  persistence: ReturnType<typeof store.getPersistenceInfo>;
}

function normalizeZipEntryName(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isProtectedPath(relPosix: string): boolean {
  const firstSegment = relPosix.split('/')[0];
  if (!firstSegment) return true;
  if (PROTECTED_TOP_SEGMENTS.has(firstSegment)) return true;
  if (firstSegment.startsWith('.env.')) return true;
  return false;
}

function detectWrapperFolder(entryNames: string[]): string | null {
  const relevant = entryNames.filter(
    (name) => name && !name.startsWith('__MACOSX/') && path.posix.basename(name) !== '.DS_Store'
  );
  if (relevant.length === 0) return null;

  const firstSegments = new Set<string>();
  let allHaveSlash = true;
  for (const name of relevant) {
    const idx = name.indexOf('/');
    if (idx <= 0) {
      allHaveSlash = false;
      break;
    }
    firstSegments.add(name.slice(0, idx));
  }
  if (!allHaveSlash || firstSegments.size !== 1) return null;

  const candidate = Array.from(firstSegments)[0];
  if (KNOWN_APP_TOP_DIRS.has(candidate) || PROTECTED_TOP_SEGMENTS.has(candidate)) {
    return null;
  }
  return candidate;
}

export async function applyZipBuildUpdate(options: {
  zipFilePath: string;
  targetAppDir?: string;
  runBuild?: boolean;
  syncPublicHtml?: boolean;
  restartAfterUpdate?: boolean;
  adminEmail: string;
}): Promise<ZipUpdateResult> {
  const appRoot = path.resolve(options.targetAppDir || process.cwd());

  // Flush all user/app data safely BEFORE touching any application files
  await store.persistNow();

  const zipBuf = fs.readFileSync(options.zipFilePath);
  if (zipBuf.length < 4 || zipBuf[0] !== 0x50 || zipBuf[1] !== 0x4b) {
    throw new Error('Uploaded file is not a valid ZIP archive.');
  }

  const zip = new AdmZip(options.zipFilePath);
  const entries = zip.getEntries();

  if (entries.length === 0) {
    throw new Error('ZIP archive is empty.');
  }
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP archive exceeds maximum allowed file count (${MAX_ZIP_ENTRIES}).`);
  }

  let totalUncompressed = 0;
  const rawNames: string[] = [];
  for (const entry of entries) {
    totalUncompressed += Math.max(0, entry.header.size || 0);
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('ZIP archive uncompressed size exceeds 350 MB limit.');
    }
    const unixMode = (entry.header.attr >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      throw new Error(`Rejected symlink entry inside ZIP: ${entry.entryName}`);
    }
    rawNames.push(normalizeZipEntryName(entry.entryName));
  }

  const wrapperFolder = detectWrapperFolder(rawNames);
  const stripPrefix = wrapperFolder ? `${wrapperFolder}/` : '';

  let extractedFilesCount = 0;
  let skippedProtectedCount = 0;
  let hasDist = false;
  let hasServerJs = false;
  let hasSrc = false;
  let hasPackageJson = false;

  for (const entry of entries) {
    let relPosix = normalizeZipEntryName(entry.entryName);
    if (!relPosix || relPosix.startsWith('__MACOSX/') || path.posix.basename(relPosix) === '.DS_Store') {
      continue;
    }
    if (stripPrefix && relPosix.startsWith(stripPrefix)) {
      relPosix = relPosix.slice(stripPrefix.length);
    }
    if (!relPosix || relPosix === '.') continue;

    // Strict Zip-Slip & path traversal validation
    if (
      relPosix.includes('\0') ||
      relPosix.startsWith('/') ||
      /^[a-zA-Z]:/.test(relPosix) ||
      relPosix.split('/').some((seg) => seg === '..')
    ) {
      throw new Error(`Unsafe path detected inside ZIP: ${entry.entryName}`);
    }

    const normalizedRel = path.posix.normalize(relPosix).replace(/^\/+/, '');
    if (!normalizedRel || normalizedRel === '.' || normalizedRel.startsWith('..')) {
      continue;
    }

    if (isProtectedPath(normalizedRel)) {
      skippedProtectedCount += 1;
      continue;
    }

    const destPath = path.resolve(appRoot, normalizedRel);
    if (destPath !== appRoot && !destPath.startsWith(appRoot + path.sep)) {
      throw new Error(`Path escapes target app root: ${entry.entryName}`);
    }

    if (entry.isDirectory) {
      fs.mkdirSync(destPath, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const data = entry.getData();
    fs.writeFileSync(destPath, data);
    extractedFilesCount += 1;

    if (normalizedRel === 'dist/index.html') hasDist = true;
    if (normalizedRel === 'server.js') hasServerJs = true;
    if (normalizedRel.startsWith('src/')) hasSrc = true;
    if (normalizedRel === 'package.json') hasPackageJson = true;
  }

  let buildRan = false;
  let buildOutput: string | null = null;
  const shouldBuild =
    options.runBuild === true || (options.runBuild !== false && !hasDist && hasSrc && hasPackageJson);

  if (shouldBuild && fs.existsSync(path.join(appRoot, 'package.json'))) {
    try {
      const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const { stdout, stderr } = await execFileAsync(npmBin, ['run', 'build'], {
        cwd: appRoot,
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      buildRan = true;
      buildOutput = [stdout, stderr].filter(Boolean).join('\n').slice(-1500) || 'Build completed';
      if (fs.existsSync(path.join(appRoot, 'dist', 'index.html'))) hasDist = true;
      if (fs.existsSync(path.join(appRoot, 'server.js'))) hasServerJs = true;
    } catch (err) {
      const execErr = err as Error & { stdout?: string; stderr?: string };
      throw new Error(`Build failed after extracting ZIP: ${execErr.stderr || execErr.message}`);
    }
  }

  let syncedPublicHtml = false;
  if (options.syncPublicHtml !== false) {
    const distDir = path.join(appRoot, 'dist');
    const siblingPublicHtml = path.resolve(appRoot, '../public_html');
    if (
      fs.existsSync(distDir) &&
      fs.existsSync(siblingPublicHtml) &&
      siblingPublicHtml !== appRoot &&
      fs.statSync(siblingPublicHtml).isDirectory()
    ) {
      try {
        fs.cpSync(distDir, siblingPublicHtml, { recursive: true, force: true });
        syncedPublicHtml = true;
      } catch {
        // non-fatal if Hostinger handles public_html sync separately
      }
    }
  }

  // Write Passenger/Hostinger restart trigger file safely
  let restartTriggered = false;
  try {
    const tmpDir = path.join(appRoot, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'restart.txt'), `${new Date().toISOString()}\n`);
    restartTriggered = true;
  } catch {
    // ignore if tmp cannot be created
  }

  store.createAuditLog(options.adminEmail, 'APP_ZIP_UPDATED', 'system', wrapperFolder || 'root', {
    extractedFilesCount,
    skippedProtectedCount,
    hasDist,
    hasServerJs,
    buildRan,
    syncedPublicHtml,
  });
  await store.persistNow();

  return {
    ok: true,
    extractedFilesCount,
    skippedProtectedCount,
    strippedRootFolder: wrapperFolder,
    hasDist,
    hasServerJs,
    buildRan,
    buildOutput,
    syncedPublicHtml,
    restartTriggered,
    persistence: store.getPersistenceInfo(),
  };
}
