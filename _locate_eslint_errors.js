// Locate exactly which file owns ESLint's parse errors.
// Run via: cd C:/Users/dividicus/Desktop/kamikazzi && node _locate_eslint_errors.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/dividicus/Desktop/kamikazzi/kamakazii_studio3D';
process.chdir(ROOT);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });
  return { ...r, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const ESL_BIN = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');

// 1. Full ESLint and extract every error message + file
const fullR = run(process.execPath, [ESL_BIN, '.']);
const allLines = fullR.stdout.split('\n');

console.log('=== Every error line from full-repo ESLint (file:line:col + message) ===');
const errMatches = [];
for (const l of allLines) {
  const m = l.match(/^(\S.*?):\s*(\d+):(\d+)\s+error\s+(.+)$/);
  if (m) errMatches.push({ file: m[1].replace(/^\.\//, ''), line: +m[2], col: +m[3], msg: m[4] });
  // also catch ESLint's "FILE / line:col" formatting
  const m2 = l.match(/^(\S+)$/);
}
errMatches.forEach(e => console.log('  ' + e.file + ':' + e.line + ':' + e.col + ' :: ' + e.msg));

// 2. Run node --check on EVERY .js file to identify which ones actually don't parse
console.log('\n=== Files that fail node --check ===');
const findFiles = run('bash', ['-c', "find . -name '*.js' -not -path './node_modules/*' | head -300"]);
const files = findFiles.stdout.trim().split('\n').filter(Boolean);
const failing = [];
for (const f of files) {
  const r = run('node', ['--check', f]);
  if (r.status !== 0) {
    failing.push({ f, err: r.stderr.split('\n').slice(0, 3).join(' | ') });
  }
}
console.log('Failures: ' + failing.length);
failing.forEach(({ f, err }) => console.log('  ' + f + ' :: ' + err));

// 3. Identify unmatched file for the 100:17 error: scan for it via a per-file ESLint run
console.log('\n=== Per-file ESLint run to find which files have errors ===');
const filesWithErrors = [];
for (const f of files) {
  const r = run(process.execPath, [ESL_BIN, f]);
  if (r.status !== 0 && r.stdout.trim()) {
    // Extract file:line:col from per-file ESLint output
    const out = r.stdout.trim();
    if (/error/.test(out)) {
      filesWithErrors.push({ f, snippet: out.split('\n').slice(0, 6).join(' | ').trim() });
    }
  }
}
filesWithErrors.forEach(({ f, snippet }) => {
  console.log('\n--- ' + f + ' ---');
  console.log(snippet);
});

console.log('\n=== Done ===');
