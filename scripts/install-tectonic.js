#!/usr/bin/env node

/**
 * Automated Tectonic TeX Engine Installer for GitLeaf
 * Installs the official pre-compiled standalone Tectonic binary during `npm install`
 * Supports: Windows (x64), macOS (Apple Silicon / Intel), Linux (x64 / arm64)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'bin');

const TECTONIC_VERSION = '0.15.0';

const DOWNLOAD_URLS = {
  'win32-x64': `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-pc-windows-msvc.zip`,
  'darwin-arm64': `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-aarch64-apple-darwin.tar.gz`,
  'darwin-x64': `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-apple-darwin.tar.gz`,
  'linux-x64': `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
  'linux-arm64': `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-aarch64-unknown-linux-musl.tar.gz`,
};

function checkExistingTectonic() {
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'tectonic.exe' : 'tectonic';
  const localBinary = path.join(binDir, binaryName);

  if (fs.existsSync(localBinary)) {
    try {
      execSync(`"${localBinary}" --version`, { stdio: 'ignore' });
      return localBinary;
    } catch {}
  }

  try {
    const cmd = isWindows ? 'where tectonic' : 'which tectonic';
    const output = execSync(cmd, { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
    if (output && fs.existsSync(output)) {
      return output;
    }
  } catch {}

  return null;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, (res) => {
      // Handle redirects (GitHub release asset redirect)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve());
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    request.setTimeout(45000, () => {
      request.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

async function install() {
  console.log('\x1b[36m[GitLeaf]\x1b[0m Checking Tectonic TeX Engine status...');

  const existing = checkExistingTectonic();
  if (existing) {
    console.log(`\x1b[32m[GitLeaf] ✔ Tectonic TeX Engine found at:\x1b[0m ${existing}`);
    return;
  }

  const platformKey = `${process.platform}-${process.arch}`;
  const downloadUrl = DOWNLOAD_URLS[platformKey];

  if (!downloadUrl) {
    console.log(`\x1b[33m[GitLeaf] ⚠ Pre-built Tectonic binary not available for ${platformKey}. Fallback engine will be active.\x1b[0m`);
    return;
  }

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';
  const archiveName = isWindows ? 'tectonic.zip' : 'tectonic.tar.gz';
  const archivePath = path.join(binDir, archiveName);
  const binaryName = isWindows ? 'tectonic.exe' : 'tectonic';
  const targetBinary = path.join(binDir, binaryName);

  console.log(`\x1b[36m[GitLeaf]\x1b[0m Downloading official Tectonic TeX standalone binary for \x1b[32m${platformKey}\x1b[0m...`);

  try {
    await downloadFile(downloadUrl, archivePath);

    console.log('\x1b[36m[GitLeaf]\x1b[0m Extracting binary...');

    if (isWindows) {
      // Use PowerShell Expand-Archive on Windows
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${binDir}' -Force"`, {
        stdio: 'inherit',
      });
    } else {
      // Use tar on macOS / Linux
      execSync(`tar -xzf "${archivePath}" -C "${binDir}"`, {
        stdio: 'inherit',
      });
    }

    // Clean up archive
    try { fs.unlinkSync(archivePath); } catch {}

    // Make executable on unix
    if (!isWindows && fs.existsSync(targetBinary)) {
      fs.chmodSync(targetBinary, 0o755);
    }

    if (fs.existsSync(targetBinary)) {
      console.log(`\x1b[32m[GitLeaf] ✔ Tectonic TeX Engine installed successfully to ${targetBinary}!\x1b[0m`);
    } else {
      console.log('\x1b[33m[GitLeaf] ⚠ Extracted successfully, binary is ready.\x1b[0m');
    }
  } catch (err) {
    console.warn(`\x1b[33m[GitLeaf] ⚠ Automated Tectonic install skipped (${err.message}). GitLeaf will run with zero-install fallback or system TeX.\x1b[0m`);
  }
}

install();
