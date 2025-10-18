import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";

/* ========== Marca (Tridente + cuarzo) ========== */
function AtlantisLogo({ size = 92 }: { size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-hidden="true" className="atl-logo">
      <defs>
        <linearGradient id="atl-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold)" />
          <stop offset="1" stopColor="var(--gold-2)" />
        </linearGradient>
        <radialGradient id="atl-az" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="var(--atl-azure)" />
          <stop offset="100%" stopColor="var(--atl-quartz)" />
        </radialGradient>
      </defs>

      {/* Aura oceánica */}
      <circle cx="50" cy="50" r="44" fill="url(#atl-az)" opacity=".22" />

      {/* Cuarzo facetado */}
      <g opacity=".85">
        <polygon points="50,10 58,30 50,42 42,30" fill="url(#atl-gold)" />
        <polygon points="22,52 38,44 42,58 28,64" fill="url(#atl-gold)" opacity=".7" />
        <polygon points="78,54 72,66 60,60 64,46" fill="url(#atl-gold)" opacity=".7" />
      </g>

      {/* Tridente */}
      <g stroke="url(#atl-gold)" strokeWidth="2" fill="url(#atl-gold)">
        <path d="M50 18 L45 27 L48 27 L48 82 L52 82 L52 27 L55 27 Z" />
        <path d="M50 12 L56 24 L44 24 Z" />
      </g>

      {/* Anillos sutiles */}
      <circle cx="50" cy="50" r="28" fill="none" stroke="var(--atl-ice)" strokeWidth="1.6" opacity=".9" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="var(--atl-ice)" strokeWidth="1.6" opacity=".75" />
    </svg>
  );
}

/* G de Google simple, sin dependencias */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.7 3l5.6-5.6C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.4 0 19.3-8.4 19.3-19 0-1.2-.1-2.1-.3-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.3 18.9 14 24 14c3 0 5.7 1.1 7.7 3l5.6-5.6C33.6 6.1 29.1 4 24 4 16.2 4 9.5 8.5 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.1 0 9.6-1.9 13-5.1l-6.1-5c-1.8 2.1-4.1 3.1-6.9 3.1-5.1 0-9.4-3.1-11.2-7.4l-6.5 5C9.5 39.5 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.3 3.8-5.7 7-11.3 7-5.1 0-9.4-3.1-11.2-7.4l-6.5 5C9.5 39.5 16.2 44 24 44c10.4 0 19.3-8.4 19.3-19 0-1.2-.1-2.1-.3-3.5z" />
    </svg>
  );
}

export default function Login() {
  const { user, loginGoogle, loginEmail, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as any;
  const from = loc.state?.from?.pathname || "/menu";

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return (
      <main className="atl-page">
        <BackgroundOcean />
        <div className="atl-authed">
          <div className="atl-muted">
            Hola, <b>{user.email}</b>
          </div>
          <div className="atl-row">
            <button className="atl-btn ghost" onClick={() => logout()}>Salir</button>
            <button className="atl-btn primary" onClick={() => nav(from, { replace: true })}>Entrar</button>
          </div>
        </div>
      </main>
    );
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginEmail(email, pass);
      nav(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "No pudimos iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginGoogle({ preferredEmail: "artemisa.ops@gmail.com", forceSelect: true });
      nav(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "No pudimos iniciar con Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="atl-page">
      <BackgroundOcean />

      {/* Card central tipo Rappi/DiDi (vidrio + CTA grande) */}
      <section className="atl-card">
        <div className="atl-brand">
          <AtlantisLogo />
          <h1>Artemisa</h1>
          <p>POS • Fidelización • Atlántida UI</p>
        </div>

        {error && <div className="atl-error">{error}</div>}

        <button onClick={submitGoogle} disabled={loading} className="atl-btn cta">
          <GoogleGlyph />
          {loading ? "Conectando..." : "Entrar con Google"}
        </button>

        <div className="atl-sep"><span>o con tu correo</span></div>

        <form onSubmit={submitEmail} className="atl-form">
          <label className="atl-label">Email</label>
          <input
            className="atl-input"
            type="email"
            placeholder="tucorreo@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="atl-label">Contraseña</label>
          <input
            className="atl-input"
            type="password"
            placeholder="********"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
          />

          <button className="atl-btn ghost" disabled={loading}>Entrar con correo</button>
        </form>

        <p className="atl-legal">
          Al continuar aceptas nuestros{" "}
          <Link to="/legal/Terminos">Términos</Link> y{" "}
          <Link to="/legal/Privacidad">Política de Privacidad</Link>.
        </p>
      </section>

      {/* Estilos locales: paleta, vidrio, inputs, CTA y fondos */}
      <style>{`
        :root{
          --atl-navy: #0f2a47;
          --atl-ice: rgba(15,42,71,.18);
          --atl-azure: #7fe7ff;
          --atl-quartz:#c3fff1;
          --gold:#d4af37;
          --gold-2:#e3c455;
        }

        .atl-page{
          min-height:100vh; position:relative; overflow:hidden;
          display:grid; place-items:center; padding:24px;
          color:var(--atl-navy);
        }

        /* -------- Card vidrio -------- */
        .atl-card{
          width:min(92%,440px);
          background:rgba(255,255,255,.9);
          backdrop-filter: blur(16px) saturate(1.1);
          border:1px solid var(--atl-ice);
          box-shadow: 0 40px 90px rgba(10,39,64,.18);
          border-radius:28px;
          padding:22px 22px 18px;
        }
        .atl-brand{ text-align:center; }
        .atl-brand h1{ margin:.4rem 0 0; font-size:28px; font-weight:900; letter-spacing:.2px; }
        .atl-brand p{ margin:.2rem 0 0; font-size:13px; opacity:.8; }

        .atl-logo{ filter: drop-shadow(0 10px 25px rgba(16,44,70,.25)); }

        /* -------- Botones estilo "app grande" -------- */
        .atl-btn{
          height:44px; border-radius:14px; border:1px solid var(--atl-ice);
          padding:0 14px; font-weight:800; letter-spacing:.2px;
          display:inline-flex; align-items:center; justify-content:center; gap:10px;
          width:100%; transition: transform .06s ease, filter .12s ease, box-shadow .12s ease;
          background:white;
        }
        .atl-btn.ghost{ background:white; }
        .atl-btn.ghost:hover{ filter:brightness(1.02); }
        .atl-btn:active{ transform:scale(.985); }

        .atl-btn.primary{
          background:linear-gradient(180deg,var(--atl-azure),var(--atl-quartz));
          color:var(--atl-navy);
          box-shadow:0 14px 28px rgba(0,200,255,.22);
          border-color:transparent;
        }

        .atl-btn.cta{
          margin-top:12px;
          background:linear-gradient(92deg,var(--atl-azure),var(--atl-quartz));
          color:var(--atl-navy); border-color:transparent;
          box-shadow:0 16px 32px rgba(0,200,255,.24);
          font-weight:900;
        }
        .atl-btn.cta:hover{ filter:brightness(1.03); }
        .atl-btn.cta:active{ transform:scale(.985); }

        /* -------- Form -------- */
        .atl-form{ display:grid; gap:10px; margin-top:10px; }
        .atl-label{ font-size:12px; opacity:.9; margin-top:2px; }
        .atl-input{
          height:44px; border-radius:14px; border:1px solid var(--atl-ice);
          padding:0 14px; font-size:14px; outline:none; background:white;
          transition: box-shadow .12s ease, border-color .12s ease;
        }
        .atl-input:focus{
          box-shadow:0 0 0 3px rgba(0,200,255,.20);
          border-color: rgba(0,200,255,.45);
        }

        .atl-error{
          margin-top:8px; margin-bottom:6px;
          border:1px solid #fecaca; background:#fff1f2; color:#b91c1c;
          border-radius:12px; padding:8px 10px; font-size:13px;
        }

        .atl-sep{ position:relative; text-align:center; margin:12px 0 8px; }
        .atl-sep::before{
          content:""; position:absolute; left:0; right:0; top:50%; height:1px;
          background:var(--atl-ice); transform:translateY(-50%);
        }
        .atl-sep span{
          position:relative; background:rgba(255,255,255,.8); padding:0 8px;
          font-size:11px; color:#667085;
        }

        .atl-legal{
          margin-top:10px; text-align:center; font-size:11px; color:#667085;
        }
        .atl-legal a{ color:#365486; text-underline-offset:2px; }

        .atl-authed{
          width:min(92%,440px); background:rgba(255,255,255,.9);
          border:1px solid var(--atl-ice); border-radius:20px; padding:16px;
          backdrop-filter: blur(16px);
        }
        .atl-row{ display:flex; gap:10px; margin-top:10px; }
        .atl-muted{ color:#475467; }
      `}</style>
    </main>
  );
}

/* ========== Fondo: océano + destellos y “cuarzos” ========== */
function BackgroundOcean() {
  return (
    <>
      {/* Gradientes oceánicos */}
      <div className="atl-bg base" />
      {/* Olas y halos */}
      <div className="atl-bg wave-one" />
      <div className="atl-bg wave-two" />
      {/* Fragmentos de cuarzo dorado flotando */}
      <div className="quartz q1" />
      <div className="quartz q2" />
      <div className="quartz q3" />
      <style>{`
        .atl-bg.base{
          position:fixed; inset:0; z-index:-3;
          background:
            radial-gradient(60% 40% at 50% -10%, rgba(127,231,255,.55), transparent 60%),
            radial-gradient(60% 50% at 50% 115%, rgba(195,255,241,.35), transparent 60%);
        }
        .atl-bg.wave-one, .atl-bg.wave-two{
          position:fixed; left:50%; transform:translateX(-50%); z-index:-2;
          width:1200px; height:260px; border-radius:120px; filter: blur(40px); opacity:.5;
          background:linear-gradient(90deg, var(--atl-azure), var(--atl-quartz));
        }
        .atl-bg.wave-one{ top:-120px; }
        .atl-bg.wave-two{ top:-50px; opacity:.35; }

        @keyframes float { 0%{ transform:translateY(0) } 50%{ transform:translateY(-10px) } 100%{ transform:translateY(0) } }
        .quartz{
          position:fixed; z-index:-1; width:120px; height:120px;
          background:linear-gradient(135deg, var(--gold), var(--gold-2));
          clip-path: polygon(50% 0%, 80% 20%, 100% 60%, 60% 100%, 20% 80%, 0% 40%);
          filter: drop-shadow(0 30px 60px rgba(212,175,55,.25));
          opacity:.35; animation: float 7s ease-in-out infinite;
        }
        .quartz.q1{ left:4%;  bottom:10%; transform:rotate(-12deg); }
        .quartz.q2{ right:8%; bottom:16%; transform:rotate(10deg); animation-duration: 8s; }
        .quartz.q3{ left:12%; top:12%; width:90px; height:90px; transform:rotate(4deg); animation-duration: 9s; }
      `}</style>
    </>
  );
}
