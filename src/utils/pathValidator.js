import path from 'path';
import { config } from '../config/env.js';

export function normalizeSystemPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const resolved = path.resolve(filePath);
  return resolved.replace(/^([a-zA-Z]):\\/, (match, drive) => `${drive.toLowerCase()}:\\`);
}

/**
 * Cleans user-provided drive or folder paths:
 * - Strips enclosing quotes ("..." or '...')
 * - Strips file:/// protocol
 * - Detects invalid HTTP/cloud URLs and provides friendly guidance
 * - Normalizes forward slashes to system path separators
 */
export function cleanInputPath(input) {
  if (!input || typeof input !== 'string') return '';
  let cleaned = input.trim();

  // Strip enclosing quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip file:/// URL protocol
  if (cleaned.startsWith('file:///')) {
    cleaned = decodeURIComponent(cleaned.replace(/^file:\/\/\//, ''));
  }

  // Check if user entered a web link (Google Drive, Dropbox, OneDrive web URL)
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    throw new Error(
      'Web links (such as Google Drive or cloud URLs) cannot be scanned directly. ' +
      'Please provide a local Windows drive or folder path (for example: E:\\ or E:\\Photos, ' +
      'or your local Google Drive for Desktop virtual drive like G:\\My Drive\\Photos).'
    );
  }

  // Normalize slashes if drive letter is present (e.g. E:/Photos -> E:\Photos)
  if (/^[a-zA-Z]:[\\/]/.test(cleaned)) {
    cleaned = path.normalize(cleaned);
  }

  return cleaned;
}

/**
 * System and dangerous folders that must never be served or accessed
 */
export const SYSTEM_FORBIDDEN_NAMES = new Set([
  '$recycle.bin',
  'system volume information',
  'recovery',
  'msocache',
  '$windows.~bt',
  '$windows.~ws',
  'windows'
]);

/**
 * Folders that the scanner should skip during directory traversal
 */
export const SCANNER_IGNORED_NAMES = new Set([
  ...SYSTEM_FORBIDDEN_NAMES,
  'program files',
  'program files (x86)',
  'appdata',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'storage',
  'thumbnails',
  '.gemini',
  '.vscode'
]);

/**
 * Checks if a given file path is strictly inside the permitted gallery root
 * and prevents directory traversal attacks and system folder access.
 */
export function isPathInsideRoot(targetPath, rootPath = config.galleryRoot) {
  if (!targetPath || typeof targetPath !== 'string') return false;

  // Reject paths containing null bytes
  if (targetPath.indexOf('\0') !== -1) return false;

  const normalizedTarget = normalizeSystemPath(targetPath);
  const normalizedRoot = normalizeSystemPath(rootPath);

  const rootPrefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;

  // The target must either be equal to root or start with rootPrefix
  const isInside = normalizedTarget.startsWith(rootPrefix) || normalizedTarget === normalizedRoot;
  if (!isInside) return false;

  // Prevent accessing OS forbidden system locations
  const relative = path.relative(normalizedRoot, normalizedTarget);
  const segments = relative.toLowerCase().split(path.sep);
  for (const seg of segments) {
    if (SYSTEM_FORBIDDEN_NAMES.has(seg)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a directory should be skipped during recursive drive scanning
 */
export function shouldSkipDirectory(dirPath, rootPath = config.galleryRoot) {
  const baseName = path.basename(dirPath).toLowerCase();
  if (SCANNER_IGNORED_NAMES.has(baseName)) {
    return true;
  }
  // Hidden directories starting with '.'
  if (baseName.startsWith('.') && baseName.length > 1) {
    return true;
  }

  // Skip the application's own storage directory
  const normDir = normalizeSystemPath(dirPath);
  const normStorage = normalizeSystemPath(path.resolve(config.thumbnailDir, '..'));
  if (normDir.startsWith(normStorage)) {
    return true;
  }

  return false;
}
