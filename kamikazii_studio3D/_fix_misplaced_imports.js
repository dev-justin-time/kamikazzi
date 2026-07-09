/* One-shot helper: relocate misplaced static `import { dbg } from '...';`
 * statements + handle the engine.js local-dbg collision.
 *
 * Strategy:
 *   1. For each broken file, find ALL `import { dbg } from '...';` lines.
 *      Static ES-module imports must be at the top of the file. If any
 *      of these import lines appears BEFORE an existing top-level import
 *      is "broken" by intervening code, remove it and reinsert at the top.
 *   2. The "is misplaced" heuristic: walk the file line-by-line, tracking
 *      whether we've seen the first non-import, non-export-decl, non-comment
 *      code line. If a `import { dbg } from '...';` line appears AFTER
 *      that first code line, mark it as misplaced.
 *   3. Special-case app/engine.js: it has a preexisting local `dbg` helper
 *      that collides with the import. Rename the local helper to `_localDbg`
 *      and update its 3 callsites (warn/error/log).
 *
 *   Deletable after the fix lands.
 */

'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname);
const FILES = [
  path.join(PROJECT, 'app', 'studio.js'),
  path.join(PROJECT, 'marketplace', 'PluginRegistry.js'),
  path.join(PROJECT, 'tools', 'blender', 'world.js'),
];

function readSrc(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeSrc(file, src) {
  const hadCRLF = /\r\n/.test(src);
  // We always normalise CRLF -> LF on write, then restore.
  const lf = hadCRLF ? src.replace(/\r\n/g, '\n') : src;
  if (hadCRLF) {
    // Most common case for app/studio.js (the studio3D files use CRLF on Windows).
  }
  fs.writeFileSync(file, hadCRLF ? lf.replace(/\n/g, '\r\n') : lf);
}

function isCommentOrBlank(line) {
  return /^\s*(\/\/|\/\*|\*|\s*$)/.test(line);
}
function isStaticImport(line) {
  return /^\s*import\s/.test(line);
}
function isStaticExportDecl(line) {
  return /^\s*export\s+(class|const|let|var|function|async function|\*|default)/.test(line);
}

/**
 * Locate misplaced `import { dbg } from '...';` lines. A line is misplaced
 * if it is a static import AND there is a code line (non-import, non-export,
 * non-comment, non-blank) that appears BEFORE it in the file.
 */
function findMisplacedDbgImports(lines) {
  const misplacedIndices = [];
  let seenCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOrBlank(line)) continue;
    if (isStaticImport(line)) {
      // Check it's the dbg import.
      if (/^\s*import\s*\{\s*dbg\s*\}\s*from\s*['"][^'"]*dbg\.js['"]/.test(line)) {
        if (seenCode) {
          misplacedIndices.push(i);
        }
      }
      continue;
    }
    if (isStaticExportDecl(line)) {
      // export class/const/... are top-level declarations, NOT code — keep
      // seenCode = false (next dbg imports can still be top-level valid).
      continue;
    }
    // Anything else (function body, assignment, expression, etc.) = code.
    seenCode = true;
  }
  return misplacedIndices;
}

/**
 * Find the line index of the LAST static import at the top of the file.
 * Definition of "the top": up to the first non-import, non-export-decl,
 * non-comment, non-blank line.
 */
function findLastTopImportIndex(lines) {
  let lastIdx = -1;
  let seenCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOrBlank(line)) continue;
    if (isStaticImport(line)) { lastIdx = i; continue; }
    if (isStaticExportDecl(line)) { continue; } // still top
    seenCode = true;
    return lastIdx;
  }
  return lastIdx;
}

const summary = [];

for (const file of FILES) {
  const src = readSrc(file);
  const lines = src.split('\n');
  const misplaced = findMisplacedDbgImports(lines);
  if (misplaced.length === 0) {
    summary.push({ file: path.relative(PROJECT, file), action: 'no-op' });
    continue;
  }
  const lastTopImport = findLastTopImportIndex(lines);
  if (lastTopImport === -1) {
    summary.push({ file: path.relative(PROJECT, file), action: 'no-top-imports-found', misplaced });
    continue;
  }
  // Collect misplaced import statements (preserve indentation).
  const removed = [];
  for (const idx of misplaced) removed.push(lines[idx]);
  // Remove in descending order so indices stay valid.
  for (let i = misplaced.length - 1; i >= 0; i--) {
    lines.splice(misplaced[i], 1);
  }
  // Find the position to insert. After splicing, the existing top imports
  // are untouched. Insert the misplaced one immediately after the (still-
  // valid) last top import.
  const insertAt = lastTopImport + 1;
  // Insert in original order (top-to-bottom).
  for (let i = 0; i < removed.length; i++) {
    lines.splice(insertAt + i, 0, removed[i]);
  }
  const newSrc = lines.join('\n');
  writeSrc(file, newSrc);
  summary.push({ file: path.relative(PROJECT, file), action: 'relocated', from: misplaced, to: insertAt });
}

console.log('=== summary ===');
for (const s of summary) console.log(JSON.stringify(s));
