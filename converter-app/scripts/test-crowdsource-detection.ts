import { readFileSync } from 'fs';
import { join } from 'path';
import { detectClassicTemplate } from '../src/refactor/util/detectTemplate.ts';

const file = join(process.cwd(), '..', 'classic-apps', 'json_schemas', 'crowdsource', 'v0.9.0', 'app2-f1fcc302b0864b0c94beffc5177da2b8.json');
const json = JSON.parse(readFileSync(file, 'utf-8'));
const template = detectClassicTemplate(json);
console.log('Detected template:', template);
