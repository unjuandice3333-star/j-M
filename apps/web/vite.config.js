import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { apiDevPlugin } from './dev/apiDevPlugin.js';
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

/** Aplica la guarda con el entorno que Vite resolvió de verdad (envDir efectivo + variables VITE_* del proceso). */
function deployGuardPlugin() {
  return {
    name: 'jm-deploy-guard',
    configResolved(config) {
      const { problems } = deployGuard({ viteAppEnv: config.env.VITE_APP_ENV, processEnv: process.env });
      if (problems.length) throw new Error(`[Guarda de despliegue] Configuración rechazada:\n - ${problems.join('\n - ')}`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => {
  const { signals } = deployGuard({ viteAppEnv: undefined, processEnv: process.env });
  return {
    plugins: [deployGuardPlugin(), react(), apiDevPlugin(__dirname)],
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
