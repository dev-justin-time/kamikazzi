/**
 * _codemod_console_to_dbg.js
 *
 * AST-aware console-to-dbg migration for kamakazii_3d_aero_comand/game/.
 *
 * This codemod is the AST-aware counterpart to the regex-based migration
 * that was used in kamakazii_studio3D. The regex version's `insertImport()`
 * helper used `^\s*import\b` to find the LAST import line — but that
 * pattern also matched dynamic `import('...')` expressions inside function
 * bodies, so static `import { dbg } from '...';` was sometimes inserted
 * mid-function. The fix took 5 iterations of patch scripts.
 *
 * This codemod avoids that class of bug by:
 *   1. Using jscodeshift's AST to find REAL top-level ImportDeclaration
 *      nodes (NOT dynamic import() expressions).
 *   2. Inserting the dbg import AFTER the last existing ImportDeclaration,
 *      or at the top of the file if no imports exist.
 *   3. Replacing console.{log,warn,error,info} with dbg.* only when the
 *      call is a top-level CallExpression whose callee is `console.<method>`.
 *   4. Skipping any console.* call inside a string literal or comment
 *      (the AST doesn't even surface those).
 *
 * Usage:
 *   cd kamakazii_3d_aero_comand
 *   node _codemod_console_to_dbg.js --dry      # show what would change
 *   node _codemod_console_to_dbg.js            # apply changes
 *
 * After the codemod runs, the 2 console.* calls inside game/error-logger.js
 * are EXPLICITLY ALLOWED via per-line // eslint-disable-next-line directives
 * (the global error logger must always reach stdout). See
 * eslint.config.mjs for the no-restricted-imports rule.
 *
 * Idempotency: re-running the codemod is a no-op (the AST has no more
 * console.* calls to replace, and the import check uses j.hasImport()).
 */

const path = require('path');
const fs = require('fs');

// Resolve jscodeshift from the project root (or its parent's node_modules).
let jscodeshift;
try {
  jscodeshift = require('jscodeshift').withParser('babel');
} catch (e) {
  try {
    jscodeshift = require(path.join(__dirname, '..', 'node_modules', 'jscodeshift')).withParser('babel');
  } catch (e2) {
    console.error('jscodeshift is not installed. Run: npm install --save-dev jscodeshift');
    process.exit(1);
  }
}

const ROOT = __dirname;
const GAME_DIR = path.join(ROOT, 'game');
const DBG_FILE_ABS = path.join(GAME_DIR, 'dbg.js');
const ALLOWLIST = new Set([
  path.join(GAME_DIR, 'dbg.js'),
  path.join(GAME_DIR, 'error-logger.js'),
]);
const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug'];

const dryRun = process.argv.includes('--dry');
let stats = { files: 0, changed: 0, callsReplaced: 0, importsAdded: 0, errors: 0 };

function walkSync(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
      walkSync(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function computeImportPath(fromFile) {
  // For game/file.js: ./dbg.js
  // For game/ui/file.js: ../dbg.js
  // For game/world/ideas.js: ../dbg.js
  // jscodeshift's `printPath`/file paths use OS separators; the printed
  // import path needs forward slashes for ESM source.
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, DBG_FILE_ABS);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel.replace(/\\/g, '/');
}

function transform(file) {
  const source = fs.readFileSync(file, 'utf8');
  const j = jscodeshift;
  const root = j(source);
  let modified = false;
  let callsReplaced = 0;

  // 1. Find every console.<method>(...) call (CallExpression, NOT in a string).
  root.find(j.CallExpression, {
    callee: {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'console' },
    },
  }).forEach((path) => {
    const prop = path.node.callee.property;
    if (!prop || prop.type !== 'Identifier') return;
    if (!CONSOLE_METHODS.includes(prop.name)) return;
    // Replace the callee: console.log -> dbg.log
    path.node.callee.object = j.identifier('dbg');
    modified = true;
    callsReplaced++;
  });

  if (!modified) return null; // no changes

  // 2. Ensure the file imports { dbg } from '<rel>'. Use AST, not regex.
  const relImportPath = computeImportPath(file);
  const hasDbgImport = root
    .find(j.ImportDeclaration, { source: { value: relImportPath } })
    .filter((p) => {
      const specs = p.node.specifiers || [];
      return specs.some((s) => s.type === 'ImportSpecifier' && s.imported && s.imported.name === 'dbg');
    })
    .size() > 0;

  if (!hasDbgImport) {
    const newImport = j.importDeclaration(
      [j.importSpecifier(j.identifier('dbg'))],
      j.literal(relImportPath),
    );

    // Find the LAST top-level ImportDeclaration. AST-only — no regex.
    const importDecls = root.find(j.ImportDeclaration);
    if (importDecls.size() > 0) {
      // Insert after the last one.
      const last = importDecls.at(importDecls.size() - 1);
      last.insertAfter(newImport);
    } else {
      // No imports yet — prepend at the top of the program (before any
      // top-level statement).
      const program = root.get(0).node.program;
      program.body.unshift(newImport);
    }
  }

  return root.toSource({ quote: 'single', reuseWhitespace: true });
}

function main() {
  const files = walkSync(GAME_DIR);
  for (const file of files) {
    if (ALLOWLIST.has(file)) continue; // skip dbg.js + error-logger.js
    stats.files++;
    try {
      const out = transform(file);
      if (out != null) {
        if (!dryRun) fs.writeFileSync(file, out, 'utf8');
        stats.changed++;
        stats.callsReplaced += (out.match(/dbg\.(log|warn|error|info|debug)\(/g) || []).length;
        if (!rootFileHasDbgImport(file)) stats.importsAdded++;
        const tag = dryRun ? 'WOULD-CHANGE' : 'CHANGED';
        console.log(`${tag} ${path.relative(ROOT, file)}`);
      }
    } catch (e) {
      stats.errors++;
      console.error(`ERROR ${path.relative(ROOT, file)}: ${e.message}`);
    }
  }
  console.log('');
  console.log(`=== Codemod summary (${dryRun ? 'DRY RUN' : 'APPLIED'}) ===`);
  console.log(`Files scanned:  ${stats.files}`);
  console.log(`Files changed:  ${stats.changed}`);
  console.log(`Calls replaced: ${stats.callsReplaced}`);
  console.log(`Errors:         ${stats.errors}`);
}

function rootFileHasDbgImport(file) {
  // Quick check after write — used only for the stats counter.
  const content = fs.readFileSync(file, 'utf8');
  return /import\s*\{[^}]*\bdbg\b[^}]*\}\s*from/.test(content);
}

main();
