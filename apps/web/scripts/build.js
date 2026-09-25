import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Find project root regardless of whether CWD is root or apps/web
let rootDir = process.cwd();
if (!fs.existsSync(path.join(rootDir, 'apps', 'web')) && fs.existsSync(path.join(rootDir, '..', 'apps', 'web'))) {
  rootDir = path.resolve(rootDir, '..');
}

console.log('=== STARTING MONOREPO BUILD FOR VERCEL ===');
console.log('Root Directory:', rootDir);

// Run vite build inside apps/web
const webDir = path.join(rootDir, 'apps', 'web');
execSync('npx vite build', { cwd: webDir, stdio: 'inherit', shell: true });

const srcDist = path.join(webDir, 'dist');
const rootDist = path.join(rootDir, 'dist');

const routes = [
  'cuenta',
  'ropa',
  'calzado',
  'accesorios',
  'colecciones',
  'mas-vendidos',
  'ofertas',
  'admin',
  'carrito',
  'checkout',
  'nuevo',
  'favoritos'
];

function generateRouteFallbacks(targetDir) {
  const indexHtmlPath = path.join(targetDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) return;

  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

  fs.writeFileSync(path.join(targetDir, '404.html'), htmlContent);

  routes.forEach((route) => {
    const routeDir = path.join(targetDir, route);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.writeFileSync(path.join(routeDir, 'index.html'), htmlContent);
  });
}

if (fs.existsSync(srcDist)) {
  generateRouteFallbacks(srcDist);

  try {
    if (fs.existsSync(rootDist)) {
      fs.rmSync(rootDist, { recursive: true, force: true });
    }
    fs.cpSync(srcDist, rootDist, { recursive: true });
    generateRouteFallbacks(rootDist);
  } catch (err) {
    console.log('Note: could not copy to root dist (non-fatal):', err.message);
  }

  console.log('=== BUILD COMPLETE: Generated static route fallbacks & copied dist ===');
}
