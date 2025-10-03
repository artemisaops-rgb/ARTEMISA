import React from "react";
import { Link } from "react-router-dom";

export default function Terminos() {
  return (
    <div className="container-app max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Trminos de Uso ?" Artemisa</h1>
      <p className="text-sm text-slate-600">sltima actualizacin: 2025-09-29</p>

      <section className="space-y-2">
        <h2 className="font-semibold">1. Objeto</h2>
        <p>Artemisa es una app de Punto de Venta y gestin interna (inventario, ventas, caja y reportes).</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">2. Cuentas y acceso</h2>
        <p>El acceso es para personal autorizado. Las acciones realizadas bajo tu sesin se consideran vlidas.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">3. Evidencia fotogrfica</h2>
        <p>La app no almacena fotos de apertura. La evidencia se enva externamente al grupo de WhatsApp y se confirma dentro de la app.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">4. Datos y respaldos</h2>
        <p>Los datos se almacenan en Firebase (Firestore). Puedes exportar informacin desde la seccin <b>Exportes</b>.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">5. Limitacin de responsabilidad</h2>
        <p>Artemisa se ofrece tal cual. No garantizamos disponibilidad ininterrumpida. El usuario es responsable del uso y de mantener sus credenciales.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">6. Contacto</h2>
        <p>Soporte: <a href="mailto:artemisa.ops@gmail.com" className="underline">artemisa.ops@gmail.com</a>. Consulta la <Link to="/legal/privacidad" className="underline">Poltica de Privacidad</Link>.</p>
      </section>
    </div>
  );
}
