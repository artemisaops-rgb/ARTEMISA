import React from "react";

export default function Privacidad() {
  return (
    <div className="container-app max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Poltica de Privacidad ?" Artemisa</h1>
      <p className="text-sm text-slate-600">sltima actualizacin: 2025-09-29</p>

      <section className="space-y-2">
        <h2 className="font-semibold">1. Qu datos recopilamos</h2>
        <ul className="list-disc pl-6">
          <li>Productos, inventario y recetas.</li>
          <li>"rdenes/ventas, mtodos de pago y totales.</li>
          <li>Movimientos de caja (ingresos/egresos) y aperturas/cierres (sin fotos).</li>
          <li>Horarios y agenda.</li>
          <li>Datos bsicos de cuentas de usuario (correo) a travs de Firebase Auth.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">2. Dnde se almacenan</h2>
        <p>La informacin se almacena en Google Firebase (Cloud Firestore). Parte de la app puede cachearse localmente como PWA para uso offline.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">3. Para qu usamos los datos</h2>
        <p>Operacin del punto de venta: inventario, ventas, caja, reportes y respaldo.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">4. Retencin y eliminacin</h2>
        <p>Conservamos los datos hasta que el administrador los elimine o solicite su borrado. Se puede exportar desde la seccin <b>Exportes</b>.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">5. Seguridad</h2>
        <p>El acceso requiere autenticacin mediante Firebase Auth. Las reglas de Firestore restringen lectura/escritura segn usuario y estado del documento.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">6. Contacto</h2>
        <p>Para solicitudes de privacidad, escribe a <a href="mailto:artemisa.ops@gmail.com" className="underline">artemisa.ops@gmail.com</a>.</p>
      </section>
    </div>
  );
}
