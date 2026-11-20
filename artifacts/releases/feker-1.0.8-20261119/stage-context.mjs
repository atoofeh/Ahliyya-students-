import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const entry = fs.readFileSync(new URL('./context-entry.md', import.meta.url));
const file = 'docs/SERVER_CONTEXT.md';
const current = fs.readFileSync(file);
if (!current.includes(entry)) fs.appendFileSync(file, entry);
// Preserve pre-existing, unrelated context edits in the working tree. Commit
// only the verified release entry on top of the currently committed document.
const baseline = execFileSync('git', ['show', `HEAD:${file}`]);
const indexed = new URL('./indexed-server-context.md', import.meta.url);
fs.writeFileSync(indexed, Buffer.concat([baseline, entry]));
const sha = execFileSync('git', ['hash-object', '-w', fileURLToPath(indexed)], { encoding: 'utf8' }).trim();
execFileSync('git', ['update-index', '--cacheinfo', `100644,${sha},${file}`]);
console.log('Staged only the verified production release entry.');
