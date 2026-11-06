# RESTAURACIÓN DEL PROYECTO DESDE LAS COPIAS DE PRESERVACIÓN

## A. Desde el bundle (recomendado: historial completo)
Requisito: solo git. No necesita red ni acceso a GitHub.

1. Verificar la integridad (debe coincidir con `BUNDLE.sha256`):
```bash
sha256sum -c BUNDLE.sha256
```
2. Verificar el bundle; debe decir "is okay" y "records a complete history":
```bash
git bundle verify jm-fashion-store_db-baseline-m24b_<HEAD>.bundle
```
3. Clonar la rama de trabajo:
```bash
git clone --branch db/baseline-m24b jm-fashion-store_db-baseline-m24b_<HEAD>.bundle j-M
```
4. Comprobar los commits de misión:
```bash
cd j-M && git log --oneline -6
```
```bash
git rev-parse 465e294:supabase
```
El segundo debe devolver `daefb1318501d4198d97a1a09c088fd3d2345308`.

5. Comprobar los archivos contra el inventario (180/180):
```bash
sha256sum -c --quiet PRESERVACION_M24/INVENTARIO_M24.sha256
```
6. Enlazar con GitHub para continuar (solo si el propietario lo autoriza):
```bash
git remote set-url origin https://github.com/unjuandice3333-star/j-M.git
```

### Integrar el bundle en un clon existente de GitHub
```bash
git fetch /ruta/jm-fashion-store_db-baseline-m24b_<HEAD>.bundle db/baseline-m24b:db/baseline-m24b
```
El bundle incluye `main` (`2661f2a`) como referencia. No sobrescribe nada: crea o actualiza la rama local `db/baseline-m24b`.

## B. Solo documentos y evidencias (sin git)
```bash
sha256sum -c EXPORT.sha256
```
```bash
tar -xzf jm_m24_documentos_y_evidencias_c09a4a3.tar.gz
```
```bash
cd jm_m24_export && sha256sum -c --quiet ../INVENTARIO_M24.sha256
```

## C. Revalidar la base de datos tras restaurar
Requisitos: Docker y Node 18+. No enlazar proyectos remotos.
```bash
npm i --no-save supabase@3
```
```bash
npx supabase start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor
```
```bash
npx supabase db reset
```
```bash
npx supabase test db
```
Esperado: `Files=11, Tests=290, Result: PASS`.

## D. Qué NO hacer al restaurar
- No ejecutar `supabase db push` ni `supabase link` contra QA o Production.
- No restaurar sobre `main` ni forzar push: la rama de trabajo es `db/baseline-m24b`.
