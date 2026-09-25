import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('=== STARTING MONOREPO BUILD FOR VERCEL ===');
execSync('pnpm --filter @jm/web build', { stdio: 'inherit' });

const srcDist = path.resolve('apps/web/dist');
const rootDist = path.resolve('dist');

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

  // Generate 404.html fallback for Vercel
  fs.writeFileSync(path.join(targetDir, '404.html'), htmlContent);

  // Generate route directory index.html files for 100% static routing success
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

  if (fs.existsSync(rootDist)) {
    fs.rmSync(rootDist, { recursive: true, force: true });
  }
  fs.cpSync(srcDist, rootDist, { recursive: true });
  generateRouteFallbacks(rootDist);

  console.log('=== BUILD COMPLETE: Generated static route fallbacks & copied dist ===');
}
