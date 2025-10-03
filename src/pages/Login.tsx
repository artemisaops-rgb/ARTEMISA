import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";

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
      <div className="container-app pt-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Hola, <span className="font-semibold">{user.email}</span>
          </div>
          <button className="btn btn-ghost" onClick={() => logout()}>
            Salir
          </button>
        </div>
        <div className="mt-6">
          <button className="btn btn-primary" onClick={() => nav(from, { replace: true })}>
            Entrar
          </button>
        </div>
      </div>
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
      setError(err?.message || "No pudimos iniciar sesin.");
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginGoogle({
        preferredEmail: "artemisa.ops@gmail.com",
        forceSelect: true,
      });
      nav(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "No pudimos iniciar con Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-white font-extrabold text-xl">
            A
          </div>
        </div>

        <div className="card p-5">
          {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

          <button onClick={submitGoogle} disabled={loading} className="btn btn-primary w-full h-11">
            {loading ? "Conectando..." : "Entrar con Google"}
          </button>

          <div className="my-4 text-center text-xs text-gray-400">o con tu correo</div>

          <form onSubmit={submitEmail} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="tucorreo@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Contrasea</label>
              <input
                className="input"
                type="password"
                placeholder="********"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-ghost w-full h-11" disabled={loading}>
              Entrar con Email
            </button>
          </form>

          <p className="mt-4 text-[11px] text-gray-500">
            Al continuar aceptas nuestros Trminos y Poltica de Privacidad.
          </p>
        </div>
      </div>
    </main>
  );
}
