import { validateWebMaps } from '../src/refactor/services/WebMapValidator';

async function main() {
  const token = process.argv[2] || undefined;
  const idsArg = process.argv[3] || '[]';
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(idsArg);
    if (Array.isArray(parsed)) ids = parsed.filter((x) => typeof x === 'string');
  } catch {
    ids = [];
  }
  const warnings = await validateWebMaps(ids, token);
  process.stdout.write(JSON.stringify({ webmapIds: ids, warnings }));
}

main().catch((e) => {
  process.stderr.write(String(e?.message || e || 'Validator failed'));
  process.exit(1);
});
