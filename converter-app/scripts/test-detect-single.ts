import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectClassicTemplate } from '../src/util/detectTemplate';
import type { ClassicStoryMapJSON } from '../src/types/classic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rel = process.argv[2] || '../../test_data/classics/MapJournal/b628131d8d3241bab21dab5bac7473be.json';
const targetPath = path.resolve(__dirname, rel);

const raw = readFileSync(targetPath, 'utf-8');
const data: ClassicStoryMapJSON = JSON.parse(raw);

const tmpl = detectClassicTemplate(data);
console.log('Detected template:', tmpl);
