import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../src-tauri/',import.meta.url);
const permissions=readFileSync(new URL('permissions/workspace.toml',root),'utf8');
const registry=readFileSync(new URL('src/lib.rs',root),'utf8');
const sections=readFileSync(new URL('src/commands/sections.rs',root),'utf8');

test('every desktop Tauri command in the handler is allowed in the workspace capability',()=>{
 const handler=new Set([...registry.matchAll(/commands::[a-z0-9_]+::([a-z0-9_]+),/g)].map(m=>m[1]));
 const allowed=new Set([...permissions.matchAll(/^\s*"([a-z][a-z0-9_]*)",?\s*$/gm)].map(m=>m[1]));
 const missing=[...handler].filter(name=>!allowed.has(name));
 assert.deepEqual(missing,[], 'Commands can compile but fail in production with "not allowed. Command not found"');
 assert.deepEqual([...allowed].filter(name=>!handler.has(name)),[], 'Remove stale workspace permissions');
});
test('chat rubro commit command is implemented, registered, and explicitly authorized',()=>{
 assert.match(sections,/pub\(crate\) fn apply_reviewed_section_batch\(/);
 assert.match(registry,/commands::sections::apply_reviewed_section_batch,/);
 assert.match(permissions,/"apply_reviewed_section_batch"/);
 assert.match(permissions,/"apply_budget_section_edits"/);
});
