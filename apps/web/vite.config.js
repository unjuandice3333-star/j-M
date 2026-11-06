import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readDeploySignals, publicDeploySignals, deployContext, deployContextProblems, cleanSignal } from './src/config/deployContext.js';

// M26-R1.1 (MAJ-2) — Guarda del contexto de despliegue en el BUILD (también el que ejecuta Vercel, que no pasa por
// la guarda de la fábrica T2). Las señales de plataforma (VERCEL, VERCEL_ENV, VERCEL_TARGET_ENV,
// VERCEL_GIT_COMMIT_REF) solo existen en process.env durante el build; se incrustan en el bundle para que el navegador
// aplique las mismas reglas (sin el nombre de la rama). Sin señales (local, CI, fábrica) el contexto es local/CI.
// Pura: recibe VITE_APP_ENV (ya resuelta por Vite) y el entorno del proceso de build.
export function deployGuard({ viteAppEnv: rawViteAppEnv, processEnv = {} }) {
  const signals = readDeploySignals(processEnv);
  const ctx = deployContext(signals);
  const viteAppEnv = cleanSignal(rawViteAppEnv);
  const appEnv = cleanSignal(processEnv.APP_ENV);
  const problems = [];
  // En un despliegue de Vercel identificado, VITE_APP_ENV es obligatoria ya en el build (falla cerrado).
  if (!viteAppEnv && ['preview', 'production', 'vercel-unknown', 'invalid'].includes(ctx)) problems.push('VITE_APP_ENV: obligatoria en un despliegue de Vercel');
  if (viteAppEnv && !['local', 'qa', 'production'].includes(viteAppEnv)) problems.push('VITE_APP_ENV: debe ser local, qa o production');
  problems.push(...deployContextProblems('VITE_APP_ENV', viteAppEnv, signals));
  if (appEnv && viteAppEnv && appEnv !== viteAppEnv) problems.push('APP_ENV y VITE_APP_ENV: contradictorias (servidor y cliente deben declarar el mismo entorno)');
  return { signals: publicDeploySignals(signals), problems: [...new Set(problems)] };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Mismas reglas de carga que Vite (archivos .env* de apps/web y variables VITE_* del proceso, que tienen prioridad).
  const { signals, problems } = deployGuard({ viteAppEnv: loadEnv(mode, __dirname, 'VITE_').VITE_APP_ENV, processEnv: process.env });
  if (problems.length) throw new Error(`[Guarda de despliegue] Configuración rechazada:\n - ${problems.join('\n - ')}`);
  return {
    plugins: [react()],
    define: { __JM_DEPLOY_SIGNALS__: JSON.stringify(signals) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: true,
    },
  };
});
