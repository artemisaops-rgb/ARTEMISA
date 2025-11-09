# Implementación del Sistema de Roles Worker - Progreso

## ✅ Completado

### 1. Sistema de Impersonación DEV
- ✅ Creado `src/flags/devRole.ts` con funciones:
  - `devOverrideRole()` - Override de rol solo en DEV
  - `setDevRole()` - Establece rol de desarrollo
  - `getDevRole()` - Obtiene rol actual de desarrollo
- ✅ Integrado en `AuthContext.tsx`:
  - Import de devOverrideRole
  - Aplicación del override en onAuthStateChanged
  - Logs en consola para debugging

### 2. Toggle Visual de Roles (DEV)
- ✅ Creado `src/components/DevRoleToggle.tsx`:
  - Select para cambiar entre roles
  - Solo visible en modo desarrollo
  - Muestra rol actual y rol forzado
  - Recarga automática al cambiar

### 3. Guard de Roles
- ✅ Verificado `RequireRole.tsx`:
  - Redirige a /login si no hay usuario
  - Redirige a / si rol no coincide
  - Muestra loading mientras verifica

## 🛠️ Pendiente

### 4. Página WorkerHome
- ☐ Crear `src/pages/worker/WorkerHome.tsx`
- ☐ Cola de órdenes en tiempo real
- ☐ Botón "Tomar orden"
- ☐ Transiciones de estado (pending → in_progress → mix_ready)

### 5. Rutas con Guards
- ☐ Configurar rutas en App.tsx:
  ```tsx
  <Route path="/worker" element={
    <RequireRole role="worker">
      <WorkerHome />
    </RequireRole>
  }/>
  ```

### 6. Script de Semillas
- ☐ Crear `scripts/seed.orders.ts`
- ☐ Agregar comando `npm run seed` en package.json
- ☐ Insertar 2-3 órdenes de prueba

### 7. Integrar DevRoleToggle
- ☐ Agregar en App.tsx o layout principal
- ☐ Solo visible en modo DEV

## 📝 Cómo usar el sistema de impersonación

### Método 1: Toggle Visual (recomendado)
1. El toggle aparecerá automáticamente en la esquina superior derecha
2. Selecciona el rol que deseas probar
3. La página se recarga automáticamente

### Método 2: Consola del Navegador
```javascript
// Forzar rol worker
localStorage.setItem("DEV_FORCE_ROLE", "worker")
window.location.reload()

// Forzar rol client
localStorage.setItem("DEV_FORCE_ROLE", "client")
window.location.reload()

// Forzar rol owner
localStorage.setItem("DEV_FORCE_ROLE", "owner")
window.location.reload()

// Volver a usar rol real
localStorage.removeItem("DEV_FORCE_ROLE")
window.location.reload()
```

## 🔒 Seguridad

- ✅ El sistema de impersonación solo funciona en `import.meta.env.DEV`
- ✅ En producción, siempre se usa el rol real del token
- ✅ Los logs de debugging solo aparecen en desarrollo
- ✅ El DevRoleToggle no se renderiza en producción

## 💾 Variables de Entorno Necesarias

Crear `.env.local` en la raíz:
```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
```

## 🚀 Próximos Pasos

1. Crear página WorkerHome con cola de órdenes
2. Agregar DevRoleToggle al App.tsx
3. Configurar rutas protegidas por rol
4. Crear script de semillas para órdenes
5. Probar el flujo completo con diferentes roles
