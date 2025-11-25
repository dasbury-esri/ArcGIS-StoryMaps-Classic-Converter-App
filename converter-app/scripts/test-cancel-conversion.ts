/*
 * Lightweight cancellation harness for refactored conversion.
 * Usage:
 *   npx ts-node scripts/test-cancel-conversion.ts          (cancel early at start)
 *   npx ts-node scripts/test-cancel-conversion.ts --phase=media  (cancel during media transfer)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertClassicToJsonRefactored } from '../src/refactor/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkDir = path.resolve(__dirname, '../../test_data/classics/bulk');
// Pick a sample classic JSON (arbitrary stable file)
const sampleFile = path.join(bulkDir, '1fe5bdf7a7d741b48605c995455c176b.json');

const args = process.argv.slice(2);
const phaseArg = args.find(a => a.startsWith('--phase='));
const phase = phaseArg ? phaseArg.split('=')[1] : 'start'; // 'start' | 'media'

function readClassic(): any {
  return JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const classicJson = readClassic();
  let cancelFlag = false;
  let progressEvents: string[] = [];
  let mediaEventCount = 0;

  const progress = (e: { stage: string; message: string; current?: number; total?: number }) => {
    progressEvents.push(`${e.stage}: ${e.message}`);
    if (phase === 'start' && e.stage === 'convert' && /Starting converter factory/.test(e.message)) {
      cancelFlag = true; // cancel immediately after initial convert message
    }
    if (phase === 'media' && e.stage === 'media') {
      // Wait for a couple of media progress iterations before canceling
      if (/Transferring media/.test(e.message)) {
        mediaEventCount++;
        if (mediaEventCount === 2) cancelFlag = true; // cancel after second media item
      }
    }
  };

  const uploader = async (url: string, storyId: string, username: string, token: string) => {
    // Simulate slight delay so media phase emits multiple events
    await sleep(50);
    return { originalUrl: url, resourceName: 'dummy-resource', transferred: true };
  };

  try {
    await convertClassicToJsonRefactored({
      classicJson,
      storyId: 'dummyStory1234567890',
      classicItemId: 'dummyClassic1234567890',
      username: 'tester',
      token: 'dummyToken',
      themeId: 'summit',
      progress,
      uploader,
      isCancelled: () => cancelFlag,
      enrichScenes: false
    });
    // If pipeline completes without throwing while we intended to cancel, mark failure
    if (cancelFlag) {
      console.error('FAIL: Pipeline completed after cancellation flag set.');
      process.exitCode = 1;
    } else {
      console.log('PASS: Pipeline completed (no cancellation requested).');
    }
  } catch (err: any) {
    if (cancelFlag && /cancelled by user intervention/i.test(err.message)) {
      console.log('PASS: Cancellation aborted pipeline as expected.');
    } else {
      console.error('FAIL: Unexpected error:', err.message);
      process.exitCode = 1;
    }
  }

  // Output concise progress trail for debugging
  console.log('\nProgress events observed (truncated to 15):');
  progressEvents.slice(0, 15).forEach(ev => console.log('  ' + ev));
  if (progressEvents.length > 15) console.log(`  ... (${progressEvents.length - 15} more)`);
}

run();
