import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('=== STARTING MONOREPO BUILD FOR VERCEL ===');
execSync('pnpm --filter @jm/web build', { stdio: 'inherit' });

const srcDist = path.resolve('apps/web/dist');
const rootDist = path.resolve('dist');

if (fs.existsSync(srcDist)) {
  if (fs.existsSync(rootDist)) {
    fs.rmSync(rootDist, { recursive: true, force: true });
  }
  fs.cpSync(srcDist, rootDist, { recursive: true });
  console.log('=== BUILD COMPLETE: Copied apps/web/dist to root /dist ===');
}
