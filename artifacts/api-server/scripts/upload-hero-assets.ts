/**
 * Upload hero-demo.mp4 and hero-demo-poster.jpg to object storage.
 *
 * Usage (from the workspace root):
 *   pnpm --filter @workspace/api-server exec tsx scripts/upload-hero-assets.ts \
 *     /path/to/hero-demo.mp4 /path/to/hero-demo-poster.jpg
 *
 * The source files are NOT committed to git — supply them from your local
 * machine or another storage location.
 *
 * After upload the assets are served at:
 *   /api/storage/public-objects/hero-demo.mp4
 *   /api/storage/public-objects/hero-demo-poster.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Storage } from '@google-cloud/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

const storage = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: 'json',
        subject_token_field_name: 'access_token',
      },
    },
    universe_domain: 'googleapis.com',
  } as any,
  projectId: '',
});

function parseObjectPath(fullPath: string): { bucketName: string; objectName: string } {
  if (!fullPath.startsWith('/')) fullPath = `/${fullPath}`;
  const parts = fullPath.split('/');
  return { bucketName: parts[1], objectName: parts.slice(2).join('/') };
}

async function uploadFile(localPath: string, objectPath: string, contentType: string) {
  if (!fs.existsSync(localPath)) {
    throw new Error(
      `Source file not found: ${localPath}\n` +
      `Pass the path explicitly: tsx scripts/upload-hero-assets.ts <video.mp4> <poster.jpg>`,
    );
  }
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const buffer = fs.readFileSync(localPath);
  await file.save(buffer, { contentType, resumable: false });
  console.log(`✓ Uploaded ${path.basename(localPath)} → gs://${bucketName}/${objectName}`);
}

async function main() {
  const searchPathsRaw = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  if (!searchPathsRaw) {
    throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not set. Run this script in the Replit environment.');
  }

  const [, , argVideo, argPoster] = process.argv;

  // Accept explicit CLI args; fall back to checking the repo videos directory
  // (only present if the source files have been manually placed there).
  const repoVideosDir = path.resolve(__dirname, '../../..', 'artifacts/quae/public/videos');
  const videoPath  = argVideo  ?? path.join(repoVideosDir, 'hero-demo.mp4');
  const posterPath = argPoster ?? path.join(repoVideosDir, 'hero-demo-poster.jpg');

  const searchPaths = searchPathsRaw.split(',').map(p => p.trim()).filter(Boolean);
  const publicPath = searchPaths[0];
  console.log(`Using public search path: ${publicPath}`);

  await uploadFile(videoPath,  `${publicPath}/hero-demo.mp4`,        'video/mp4');
  await uploadFile(posterPath, `${publicPath}/hero-demo-poster.jpg`, 'image/jpeg');

  console.log('\nDone. Assets are served at:');
  console.log('  /api/storage/public-objects/hero-demo.mp4');
  console.log('  /api/storage/public-objects/hero-demo-poster.jpg');
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exit(1);
});
