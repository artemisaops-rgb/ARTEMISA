import { useEffect, useState } from 'react';
import { getDevRole, setDevRole, type UserRole } from '../flags/devRole';
import { useAuth } from '../contexts/AuthContext';

/**
 * Toggle visual para cambiar de rol en desarrollo
 * Solo visible en modo DEV
 */
export function DevRoleToggle() {
  const { role: currentRole } = useAuth();
  const [devRole, setDevRoleState] = useState<UserRole | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      setDevRoleState(getDevRole());
    }
  }, []);

  // Solo mostrar en modo desarrollo
  if (!import.meta.env.DEV) {
    return null;
  }

  const roles: (UserRole | null)[] = [null, 'worker', 'client', 'owner', 'admin'];

  const handleRoleChange = (role: UserRole | null) => {
    setDevRole(role);
    // La página se recarga automáticamente en setDevRole
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 9999,
        background: '#1f2937',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        fontSize: '12px',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>
        👨‍💻 DEV Mode
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>Rol actual:</strong> {currentRole || 'ninguno'}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>Forzar rol:</strong>
      </div>
      <select
        value={devRole || ''}
        onChange={(e) => handleRoleChange((e.target.value || null) as UserRole | null)}
        style={{
          width: '100%',
          padding: '4px',
          borderRadius: '4px',
          border: '1px solid #374151',
          background: '#111827',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        <option value="">Sin forzar (usar real)</option>
        <option value="worker">Worker</option>
        <option value="client">Client</option>
        <option value="owner">Owner</option>
        <option value="admin">Admin</option>
      </select>
      <div style={{ marginTop: '8px', fontSize: '10px', opacity: 0.7 }}>
        ⚠️ Solo visible en desarrollo
      </div>
    </div>
  );
}
