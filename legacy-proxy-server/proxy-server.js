

import express from 'express'; // npm install express
import fetch from 'node-fetch'; // npm install node-fetch@2
import sizeOf from 'image-size' // npm install image-size
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = express();

// Add this middleware before your routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/image-dimensions', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: 'Missing url parameter' });
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch image' });
    const buffer = await response.buffer();
    const dimensions = sizeOf(buffer);
    res.json(dimensions); // { width: ..., height: ... }
  } catch (err) {
    res.status(500).json({ error: 'Error fetching image or reading dimensions' });
  }
});

app.get('/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    response.body.pipe(res);
  } catch (err) {
    res.status(500).send('Error fetching image');
  }
});

app.get('/proxy-feature', async (req, res) => {
  console.log('Proxying feature request:', req.query.url);
  const featureUrl = req.query.url;
  if (!featureUrl) {
    return res.status(400).send('Missing url parameter');
  }
  const safeUrl = featureUrl.replace(/^http:/i, 'https:');
  try {
    const response = await fetch(safeUrl);
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch feature service');
    }
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type') || 'application/json');
    response.body.pipe(res);
  } catch (err) {
    res.status(500).send('Error fetching feature service');
  }
});

// Convert a classic Map Journal to native StoryMaps JSON
// GET /convert/mapjournal?itemId=...&token=...
app.get('/convert/mapjournal', async (req, res) => {
  const itemId = req.query.itemId;
  const token = req.query.token;
  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'Missing itemId parameter' });
  }
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootDir = path.resolve(__dirname, '..');
    const tsxBin = path.resolve(rootDir, 'converter-app/node_modules/.bin/tsx');
    const scriptPath = path.resolve(rootDir, 'converter-app/scripts/convert-mapjournal.ts');
    const args = [scriptPath, itemId];
    if (typeof token === 'string' && token) args.push(token);
    execFile(tsxBin, args, { cwd: rootDir }, (err, stdout, stderr) => {
      if (err) {
        console.error('Conversion error:', err, stderr);
        return res.status(500).json({ error: 'Conversion failed' });
      }
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', 'application/json');
      res.send(stdout);
    });
  } catch (e) {
    console.error('Unhandled conversion error:', e);
    res.status(500).json({ error: 'Unhandled conversion error' });
  }
});

// eslint-disable-next-line no-undef
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});