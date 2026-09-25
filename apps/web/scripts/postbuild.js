import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const indexHtmlPath = path.join(distDir, 'index.html');

if (fs.existsSync(indexHtmlPath)) {
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

  // Generate 404.html
  fs.writeFileSync(path.join(distDir, '404.html'), htmlContent);

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

  routes.forEach((route) => {
    const routeDir = path.join(distDir, route);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.writeFileSync(path.join(routeDir, 'index.html'), htmlContent);
  });

  console.log('=== POSTBUILD SUCCESS: Created 404.html and static route fallbacks ===');
}
