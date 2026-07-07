#!/usr/bin/env node
// Scans src/ for references to undefined identifiers.
//
// Catches the "orphan ref after cross-MR rebase" bug class that produced
// three runtime regressions in one week:
//   - v0.12.1 (`sort` — T425836 removed state, rebase left refs)
//   - v0.23.1 (`stashDupesById` — T425873 removed var, T425884 left refs)
//   - v0.23.2 (`findStashDuplicate` — T425873 removed fn, T425883 left refs)
//
// esbuild bundles syntax-valid JSX without scope validation, so these
// shipped to the live root and crashed on first render. This script runs
// before `vite build` (via `npm run check:undefs`) and fails the build
// if any unbound identifier reference is found.
//
// Window-globals pattern: design files do `window.X = X` exports so
// sibling files can reference X bare. Those exports are listed in
// scripts/window-globals.json. The script verifies the JSON list matches
// the actual `window.X = ...` assignments in src/ — if they diverge,
// you get a clear "regenerate the allowlist" message instead of false
// positives.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default;

// Resolve relative to cwd (npm cd's to the package root before running scripts).
// This makes the scanner portable across worktrees / older commits.
const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'window-globals.json');

if (!existsSync(SRC)) {
  console.error(`check-undefined-refs: no src/ directory in ${ROOT}`);
  process.exit(2);
}

// Standard JS + browser globals — always considered defined.
const STANDARD_GLOBALS = new Set([
  // ES intrinsics
  'undefined', 'NaN', 'Infinity', 'globalThis',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'BigInt', 'Symbol',
  'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  'JSON', 'Math', 'Intl',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array',
  'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  // Browser DOM + Web APIs
  'window', 'document', 'location', 'history', 'navigator', 'screen', 'frames', 'top', 'parent', 'self',
  'console', 'alert', 'confirm', 'prompt',
  'fetch', 'Request', 'Response', 'Headers',
  'URL', 'URLSearchParams',
  'FormData', 'Blob', 'File', 'FileList', 'FileReader',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
  'queueMicrotask', 'structuredClone',
  'localStorage', 'sessionStorage',
  'Image', 'Audio', 'Video',
  'Element', 'HTMLElement', 'Node', 'Document', 'Window',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent', 'PointerEvent',
  'DragEvent', 'WheelEvent', 'FocusEvent', 'InputEvent', 'ClipboardEvent',
  'crypto', 'TextEncoder', 'TextDecoder',
  'atob', 'btoa',
  'AbortController', 'AbortSignal',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
  'getComputedStyle', 'matchMedia',
  'XMLHttpRequest', 'WebSocket', 'EventSource',
  // Node-ish (only relevant if scripts/ ends up parsed)
  'process', 'require', 'module', '__dirname', '__filename', 'Buffer',
]);

// Vite `define:` injections — compile-time constants that look like
// identifier refs in source but get string-replaced before bundling.
// Auto-detected by parsing vite.config.js for the `define:` block.
function readViteDefines() {
  try {
    const cfg = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    const m = cfg.match(/define\s*:\s*\{([^}]*)\}/s);
    if (!m) return new Set();
    const keys = [...m[1].matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*:/gm)].map((mm) => mm[1]);
    return new Set(keys);
  } catch {
    return new Set();
  }
}
const VITE_DEFINES = readViteDefines();

const allowlist = new Set(JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')));

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listFiles(p));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

// Sanity-check: the allowlist must match the actual `window.X = X` (and
// `globalThis.X = X`) assignments in src/. If they diverge, refuse to run
// — better than silently flagging a new export as "undefined".
function verifyAllowlistInSync() {
  const declared = new Set();
  for (const file of listFiles(SRC)) {
    const code = readFileSync(file, 'utf8');
    const re = /^\s*(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=/gm;
    let m;
    while ((m = re.exec(code)) !== null) declared.add(m[1]);
  }
  const missing = [...declared].filter((n) => !allowlist.has(n)).sort();
  const stale = [...allowlist].filter((n) => !declared.has(n) && n !== 'React' && n !== 'ReactDOM').sort();
  if (missing.length || stale.length) {
    console.error('check-undefined-refs: scripts/window-globals.json is out of sync with src/');
    if (missing.length) console.error('  missing (declared in src/, not in allowlist):', missing.join(', '));
    if (stale.length) console.error('  stale (in allowlist, no declaration in src/):', stale.join(', '));
    console.error('  → add/remove entries in scripts/window-globals.json to match.');
    process.exit(2);
  }
}

if (process.env.SCANNER_SKIP_ALLOWLIST_CHECK !== '1') verifyAllowlistInSync();

const findings = [];

for (const file of listFiles(SRC)) {
  const code = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (err) {
    findings.push({
      file: relative(ROOT, file),
      line: err.loc?.line ?? 0, col: err.loc?.column ?? 0,
      id: '(parse error)', message: err.message,
    });
    continue;
  }

  function check(name, loc, path) {
    if (STANDARD_GLOBALS.has(name)) return;
    if (VITE_DEFINES.has(name)) return;
    if (allowlist.has(name)) return;
    if (path.scope.hasBinding(name)) return;
    findings.push({
      file: relative(ROOT, file),
      line: loc?.start.line ?? 0,
      col: loc?.start.column ?? 0,
      id: name,
    });
  }

  traverse(ast, {
    ReferencedIdentifier(path) {
      check(path.node.name, path.node.loc, path);
    },
    JSXIdentifier(path) {
      const name = path.node.name;
      // JSX intrinsic tags (<div>, <span>) start lowercase and aren't JS refs.
      if (!/^[A-Z]/.test(name)) return;
      // Skip JSXAttribute names — `<Foo bar="x" />` 'bar' is an attribute key, not a JS ref.
      if (path.parent.type === 'JSXAttribute' && path.parent.name === path.node) return;
      // Skip the non-root part of JSX member expressions — `<Foo.Bar />` only Foo is a JS ref.
      if (path.parent.type === 'JSXMemberExpression' && path.parent.property === path.node) return;
      // Skip namespaced: `<svg:rect />` second part isn't a JS ref.
      if (path.parent.type === 'JSXNamespacedName' && path.parent.name === path.node) return;
      check(name, path.node.loc, path);
    },
  });
}

if (findings.length === 0) {
  console.log(`check-undefined-refs: clean (${listFiles(SRC).length} files scanned)`);
  process.exit(0);
}

console.error(`check-undefined-refs: found ${findings.length} undefined reference(s)`);
for (const f of findings) {
  const where = `${f.file}:${f.line}:${f.col}`;
  if (f.message) console.error(`  ${where}  ${f.id}: ${f.message}`);
  else console.error(`  ${where}  '${f.id}' is not defined`);
}
process.exit(1);
