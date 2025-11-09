#!/bin/bash
set -e

echo "=== PASO 3: REORGANIZAR ESTRUCTURA POR MULTIROLES ==="

# 3.1 Mover archivos según estructura objetivo (solo si existen)

# Auth
if [ -f src/pages/Login.tsx ]; then
  echo "Moviendo Login.tsx a pages/auth/"
  mkdir -p src/pages/auth
  git mv -f src/pages/Login.tsx src/pages/auth/Login.tsx 2>/dev/null || mv src/pages/Login.tsx src/pages/auth/Login.tsx
fi

if [ -f src/components/RequireRole.tsx ]; then
  echo "Moviendo RequireRole.tsx a components/auth/"
  mkdir -p src/components/auth
  git mv -f src/components/RequireRole.tsx src/components/auth/RequireRole.tsx 2>/dev/null || mv src/components/RequireRole.tsx src/components/auth/RequireRole.tsx
fi

# Dev
if [ -f src/components/DevRoleToggle.tsx ]; then
  echo "Moviendo DevRoleToggle.tsx a components/dev/"
  mkdir -p src/components/dev
  git mv -f src/components/DevRoleToggle.tsx src/components/dev/DevRoleToggle.tsx 2>/dev/null || mv src/components/DevRoleToggle.tsx src/components/dev/DevRoleToggle.tsx
fi

# Worker
if [ -f src/pages/MachineStation.tsx ]; then
  echo "Moviendo MachineStation.tsx a pages/worker/"
  mkdir -p src/pages/worker
  git mv -f src/pages/MachineStation.tsx src/pages/worker/MachineStation.tsx 2>/dev/null || mv src/pages/MachineStation.tsx src/pages/worker/MachineStation.tsx
fi

# Client
if [ -f src/pages/BuilderClient.tsx ]; then
  echo "Moviendo BuilderClient.tsx a pages/client/"
  mkdir -p src/pages/client
  git mv -f src/pages/BuilderClient.tsx src/pages/client/BuilderClient.tsx 2>/dev/null || mv src/pages/BuilderClient.tsx src/pages/client/BuilderClient.tsx
fi

# Docs
if [ -f IMPLEMENTACION_WORKER.md ]; then
  echo "Moviendo IMPLEMENTACION_WORKER.md a docs/"
  mkdir -p docs
  git mv -f IMPLEMENTACION_WORKER.md docs/IMPLEMENTACION_WORKER.md 2>/dev/null || mv IMPLEMENTACION_WORKER.md docs/IMPLEMENTACION_WORKER.md
fi

echo "✅ Estructura reorganizada"

echo "\n=== PASO 4: ELIMINAR BASURA EVIDENTE ==="

# Eliminar backups
if [ -f reports/suspects_backups_by_name.txt ]; then
  while IFS= read -r file; do
    if [ -f "$file" ] && [[ ! "$file" =~ ^# ]]; then
      echo "Eliminando: $file"
      git rm -f "$file" 2>/dev/null || rm -f "$file"
    fi
  done < reports/suspects_backups_by_name.txt
fi

# Eliminar dist/ versionado
if [ -d dist ]; then
  echo "Eliminando carpeta dist/ versionada"
  git rm -rf dist/ 2>/dev/null || rm -rf dist/
fi

echo "✅ Basura eliminada"

echo "\n=== PASO 5: NORMALIZAR IMPORTS ==="

# Normalizar imports comunes a alias @/
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec sed -i \
  -e 's#"\.\./\.\./contexts/AuthContext"#"@/contexts/AuthContext"#g' \
  -e 's#"\.\./\.\./services/firebase"#"@/services/firebase"#g' \
  -e 's#"\.\./ components/RequireRole"#"@/components/auth/RequireRole"#g' \
  -e 's#"\.\./components/DevRoleToggle"#"@/components/dev/DevRoleToggle"#g' \
  -e 's#"\.\./pages/BuilderClient"#"@/pages/client/BuilderClient"#g' \
  -e 's#"\.\./ pages/Login"#"@/pages/auth/Login"#g' \
  {} \;

echo "✅ Imports normalizados"

echo "\n=== LIMPIEZA COMPLETADA ==="
