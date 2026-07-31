/**
 * CLI：扫描 content/ → public/tree.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../site.config';
import { scanContent } from './lib/scan';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, site.content.root);
const publicDir = path.join(root, 'public');
const outTree = path.join(publicDir, 'tree.json');

const tree = scanContent(contentDir);
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outTree, JSON.stringify(tree, null, 2), 'utf8');
console.log('[scan] tree → public/tree.json（未复制 content/）');
console.log(
	'[scan] top-level:',
	tree.children.map((c) => c.name).join(', ') || '(empty)',
);
