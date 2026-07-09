// Comprehensive validation script for the 2 parse-error fixes.
// Avoids all shell-quoting headaches by using Node child_process directly.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/dividicus/Desktop/kamikazzi/kamakazii_studio3D';
process.chdir(ROOT);

const FIXED_FILES = ['app/studio.js', 'tools/blender/world.js'];
const ALL_DBG_FILES_CMD = "grep -rlE 'dbg\\.(log|warn|error|info)\\(' --include='*.js' . 2>/dev/null | grep -v node_modules";
const ALLOWLIST = ['app/dbg.js', 'app/error-logger.js', 'marketplace/test/test.js'];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });
  // Windows .cmd wrappers (like eslint.cmd) may set stdout/stderr to null
  return { ...r, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function sectionTitle(s) {
  console.log('\n=== ' + s + ' ===');
}

// 1. node --check on the 2 fixed files
sectionTitle('1. node --check on the 2 fixed files');
let okCount = 0;
for (const f of FIXED_FILES) {
  const r = run('node', ['--check', f]);
  if (r.status === 0) {
    console.log('OK   ' + f);
    okCount++;
  } else {
    console.log('FAIL ' + f);
    console.log(r.stderr.trim());
  }
}
console.log('node --check: ' + okCount + '/' + FIXED_FILES.length + ' passed');

// 2. node --check on EVERY dbg-using file
sectionTitle('2. node --check on every dbg-using file');
const grepOut = run('bash', ['-c', "grep -rlE 'dbg\\.(log|warn|error|info)\\(' --include='*.js' . 2>/dev/null | grep -v node_modules"]);
const dbgFiles = grepOut.stdout.trim().split('\n').filter(Boolean);
let dbgOk = 0, dbgFail = 0;
const dbgFailList = [];
for (const f of dbgFiles) {
  const r = run('node', ['--check', f]);
  if (r.status === 0) {
    dbgOk++;
  } else {
    dbgFail++;
    dbgFailList.push({ f, err: r.stderr.trim() });
  }
}
console.log('node --check on ' + dbgFiles.length + ' dbg-files: ' + dbgOk + ' OK, ' + dbgFail + ' failed');
for (const { f, err } of dbgFailList) {
  console.log('  FAIL ' + f + ': ' + err.split('\n')[0]);
}

// 3. ESLint per fixed file (use direct eslint.js entry to avoid .cmd wrapper flakiness on Windows)
sectionTitle('3. ESLint on the 2 fixed files');
const ESL_BIN = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
for (const f of FIXED_FILES) {
  const r = run(process.execPath, [ESL_BIN, f]);
  const tail = r.stdout.trim() || r.stderr.trim();
  const summary = tail.split('\n').slice(-6).join('\n').trim();
  console.log('--- ' + f + ' ---');
  console.log(r.status === 0 ? 'OK (0 errors)' : ('STATUS=' + r.status + ' :: ' + summary));
}

// 4. ESLint on error-logger.js
sectionTitle('4. ESLint on app/error-logger.js');
const loggerR = run(process.execPath, [ESL_BIN, 'app/error-logger.js']);
console.log(loggerR.status === 0 ? 'OK (0 errors)' : ('STATUS=' + loggerR.status + ' :: ' + loggerR.stdout.trim()));

// 5. Full repo ESLint
sectionTitle('5. Full repo ESLint (errors + warnings + first 10)');
const fullR = run(process.execPath, [ESL_BIN, '.']);
const fullLines = (fullR.stdout || '').split('\n');
const errLines = fullLines.filter(l => /^\s*\d+:\d+\s+error/.test(l));
const warnLines = fullLines.filter(l => /^\s*\d+:\d+\s+warning/.test(l));
console.log('TOTAL errors: ' + errLines.length + ' | warnings: ' + warnLines.length);
console.log('--- First 10 errors ---');
errLines.slice(0, 10).forEach(l => console.log(l));
if (errLines.length > 10) console.log('... and ' + (errLines.length - 10) + ' more');

// 6. Raw console.* outside allow-list
sectionTitle('6. Zero raw console.* outside allow-list');
const rawOut = run('bash', ['-c', "grep -rnE 'console\\.(log|warn|error|info)\\(' --include='*.js' --exclude-dir=node_modules ."]);
const rawLines = rawOut.stdout.split('\n').filter(Boolean);
const violators = rawLines.filter(line => {
  const match = line.match(/^([^:]+):/);
  if (!match) return false;
  const file = match[1];
  return !ALLOWLIST.includes(file);
});
console.log('Raw console.* outside allow-list: ' + violators.length);
violators.slice(0, 10).forEach(l => console.log('  ' + l));

// 7. dbg.* call count + cleanup check
sectionTitle('7. dbg.* call sanity (total + orphan dbg.* without import)');
const dbgOut = run('bash', ['-c', "grep -rnE 'dbg\\.(log|warn|error|info)\\(' --include='*.js' --exclude-dir=node_modules . | wc -l"]);
console.log('Total dbg.* calls: ' + dbgOut.stdout.trim());

// Check for orphan dbg.* calls (file has dbg call but no dbg import)
const orphanOut = run('bash', ['-c',
  "files=$(grep -rlE 'dbg\\.(log|warn|error|info)\\(' --include='*.js' --exclude-dir=node_modules . | grep -v 'app/dbg.js' | grep -v 'app/error-logger.js'); for f in $files; do if ! grep -q \"import.*dbg.*from\" \"$f\" 2>/dev/null; then echo \"ORPHAN: $f\"; fi; done"
]);
const orphanLines = orphanOut.stdout.trim().split('\n').filter(Boolean);
console.log('Orphan dbg.* files (call without import): ' + (orphanLines.length || 0));
orphanLines.forEach(l => console.log('  ' + l));

// Verify the 2 fixed files have dbg imports
sectionTitle('8. Verify the 2 fixed files have dbg imports at the top');
for (const f of FIXED_FILES) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  const importLines = lines.slice(0, 30).filter(l => /import.*dbg.*from/.test(l));
  console.log(f + ' — dbg import lines (top 30):');
  importLines.forEach(l => console.log('  ' + l));
}

console.log('\n=== Validation complete ===');
