import { configurationDiagnostic, configurationStatus } from "@/server/config";
import TransitApp from "./transit-app";

export const dynamic = "force-dynamic";

export default function Home() {
  const status = configurationStatus();
  const diagnostic = configurationDiagnostic();
  if (status.configured) return <TransitApp />;
  return <main id="main" className="setup-shell">
    <header className="brand">
      <svg viewBox="0 0 40 40" aria-hidden="true" width="40" height="40">
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path d="M11 14h12l6 6-6 6H11M18 14v12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <div><span className="brand-name">APA Transit</span><span className="brand-caption">Anatomía Patológica</span></div>
    </header>
    <section className="setup-card" aria-labelledby="setup-title">
      <span className="eyebrow">ENTORNO DE DESARROLLO</span>
      <h1 id="setup-title">Un registro claro.<br />Cada movimiento cuenta.</h1>
      <p className="intro">Registro de traslados mediante códigos QR, con identidad, ubicación y hora confirmadas por el servidor.</p>
      <div className="notice" role="status">
        <span className="status-dot" aria-hidden="true" />
        <div><strong>Aplicación en construcción</strong><p>{status.configured
          ? "Configuración de servidor presente. Los módulos operativos aún no están habilitados."
          : "Conexión con los servicios pendiente. El acceso y los registros están deshabilitados."}</p></div>
      </div>
      {diagnostic && <div className="notice" role="status">
        <span className="status-dot" aria-hidden="true" />
        <div><strong>Diagnóstico de configuración</strong>
          <p>Variable a corregir: {diagnostic.fields.join(", ") || "desconocida"} ({diagnostic.reason})</p></div>
      </div>}
      <h2>Preparación del entorno</h2>
      <ol className="setup-steps">
        <li><span>01</span><div><strong>Seleccionar los proyectos</strong><p>Definir el entorno de pruebas en Vercel y Supabase.</p></div></li>
        <li><span>02</span><div><strong>Verificar el acceso seguro</strong><p>Validar el perímetro de autenticación antes de habilitar cuentas reales.</p></div></li>
        <li><span>03</span><div><strong>Completar el flujo operativo</strong><p>Inicio de sesión, lectura de QR e historial compartido.</p></div></li>
      </ol>
      <p className="privacy-note">Sin pacientes, datos clínicos ni registros de prueba persistidos desde esta pantalla.</p>
    </section>
    <footer>APA Transit <span aria-hidden="true">·</span> Base de desarrollo, no habilitada para uso operativo</footer>
  </main>;
}
