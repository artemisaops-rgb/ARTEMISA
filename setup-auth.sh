#!/bin/bash
set -e

# FASE B.2 - Crear env.d.ts
cat > src/env.d.ts << 'EOF'
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
EOF

echo "✓ Created src/env.d.ts"
