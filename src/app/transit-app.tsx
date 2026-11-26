"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiFailure, loadHistory, loadMe, login, logout,
  type HistoryPage, type Movement, type SessionData
} from "@/lib/client-api";

type Screen = "home" | "history" | "account";
type State = "checking" | "signedOut" | "signedIn" | "unavailable" | "logoutError";

export function classifyHistoryFailure(
  error: unknown, requestHistoryVersion: number, activeHistoryVersion: number,
  requestSessionVersion: number, activeSessionVersion: number
): "expired" | "ignore" | "retry" {
  if (requestSessionVersion !== activeSessionVersion) return "ignore";
  if (error instanceof ApiFailure && error.status === 401) return "expired";
  return requestHistoryVersion === activeHistoryVersion ? "retry" : "ignore";
}

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago", year: "numeric", month: "long", day: "numeric"
});
const timeFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

export function LoginPanel({ pending, error, onSubmit }: {
  pending: boolean; error: string | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <section className="transit-card login-panel" aria-labelledby="login-title">
    <span className="eyebrow">ACCESO AL SERVICIO</span>
    <h1 id="login-title">Iniciar sesión</h1>
    <p className="transit-muted">Ingresá con la cuenta asignada por la administración.</p>
    <form onSubmit={onSubmit}>
      <label htmlFor="username">Usuario</label>
      <input id="username" name="username" autoComplete="username" required minLength={3} maxLength={40} disabled={pending} />
      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} />
      {error ? <p className="transit-error" role="alert">{error}</p> : null}
      <button className="transit-primary" type="submit" disabled={pending}>
        {pending ? "Ingresando…" : "Iniciar sesión"}
      </button>
    </form>
  </section>;
}

export function HistoryList({ items }: { items: Movement[] }) {
  if (!items.length) return <p className="transit-empty" role="status">Todavía no hay movimientos.</p>;
  let previousDate = "";
  return <ol className="movement-list">
    {items.map(item => {
      const date = dateFormat.format(new Date(item.recordedAt));
      const showDate = date !== previousDate;
      previousDate = date;
      return <li key={item.id} className="movement-item">
        {showDate ? <h3 className="movement-date">{date}</h3> : null}
        <div className="movement-detail">
          <span className="movement-time">{timeFormat.format(new Date(item.recordedAt))}</span>
          <div><strong>{item.locationName}</strong><span>{item.userName}</span></div>
        </div>
      </li>;
    })}
  </ol>;
}

export default function TransitApp() {
  const [state, setState] = useState<State>("checking");
  const [session, setSession] = useState<SessionData | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<Movement[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const sessionVersion = useRef(0);
  const historyVersion = useRef(0);

  function clearPrivateState() {
    sessionVersion.current++;
    historyVersion.current++;
    setSession(null);
    setItems([]);
    setCursor(null);
    setScreen("home");
    setHistoryError(null);
    setHistoryPending(false);
  }

  useEffect(() => {
    const version = ++sessionVersion.current;
    loadMe().then(data => {
      if (version !== sessionVersion.current) return;
      setSession(data);
      setState("signedIn");
    }).catch(error => {
      if (version !== sessionVersion.current) return;
      clearPrivateState();
      setState(error instanceof ApiFailure && error.status === 401 ? "signedOut" : "unavailable");
    });
    return () => { sessionVersion.current++; };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = String(fields.get("username") ?? "");
    const password = String(fields.get("password") ?? "");
    const version = ++sessionVersion.current;
    setPending(true);
    setMessage(null);
    try {
      await login(username, password);
      if (version !== sessionVersion.current) return;
      const data = await loadMe();
      if (version !== sessionVersion.current) return;
      form.reset();
      setSession(data);
      setState("signedIn");
      setScreen("home");
    } catch (error) {
      if (version !== sessionVersion.current) return;
      setMessage(error instanceof ApiFailure && error.status === 401
        ? "Usuario o contraseña incorrectos."
        : "No pudimos iniciar sesión. Intentá nuevamente.");
    } finally {
      if (version === sessionVersion.current) setPending(false);
    }
  }

  async function signOut() {
    if (pending) return;
    clearPrivateState();
    setState("checking");
    setPending(true);
    try {
      await logout();
      setState("signedOut");
      setMessage(null);
    } catch {
      // Never restore cached private data after an uncertain logout.
      setState("logoutError");
    } finally { setPending(false); }
  }

  async function fetchPage(next?: string) {
    const version = historyVersion.current;
    const sessionAtStart = sessionVersion.current;
    setHistoryPending(true);
    setHistoryError(null);
    try {
      const page: HistoryPage = await loadHistory(next);
      if (version !== historyVersion.current || sessionAtStart !== sessionVersion.current) return;
      setItems(current => {
        const seen = new Set(next ? current.map(item => item.id) : []);
        return [...(next ? current : []), ...page.items.filter(item => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
    } catch (error) {
      const outcome = classifyHistoryFailure(
        error, version, historyVersion.current, sessionAtStart, sessionVersion.current
      );
      if (outcome === "expired") {
        clearPrivateState();
        setState("signedOut");
      } else if (outcome === "retry") {
        setHistoryError("No se pudo cargar el historial. Intentá nuevamente.");
      }
    } finally {
      if (version === historyVersion.current && sessionAtStart === sessionVersion.current) setHistoryPending(false);
    }
  }

  function navigate(next: Screen) {
    if (next === "history" && screen !== "history") {
      historyVersion.current++;
      setItems([]);
      setCursor(null);
      void fetchPage();
    }
    if (next !== "history") historyVersion.current++;
    setScreen(next);
  }

  if (state === "checking") return <main id="main" className="transit-shell">
    <p className="transit-card" role="status">Comprobando sesión…</p>
  </main>;
  if (state === "unavailable") return <main id="main" className="transit-shell">
    <section className="transit-card" role="alert">
      <h1>Servicio no disponible</h1><p>Revisá la conexión e intentá nuevamente.</p>
      <button className="transit-primary" onClick={() => window.location.reload()}>Reintentar</button>
    </section>
  </main>;
  if (state === "logoutError") return <main id="main" className="transit-shell">
    <section className="transit-card" role="alert">
      <h1>No se pudo confirmar el cierre</h1>
      <p>La información se retiró de esta pantalla. Reintentá cerrar sesión.</p>
      <button className="transit-primary" onClick={() => void signOut()} disabled={pending}>Reintentar cierre</button>
    </section>
  </main>;
  if (state === "signedOut" || !session) return <main id="main" className="transit-shell">
    <div className="transit-brand"><span>APA Transit</span><small>Anatomía Patológica</small></div>
    <LoginPanel pending={pending} error={message} onSubmit={signIn} />
  </main>;

  return <main id="main" className="transit-shell transit-app">
    <header className="transit-header">
      <div className="transit-brand"><span>APA Transit</span><small>Anatomía Patológica</small></div>
      <span className="account-chip">{session.profile.fullName}</span>
    </header>
    <nav className="transit-nav" aria-label="Navegación principal">
      {([["home", "Inicio"], ["history", "Movimientos"], ["account", "Configuración"]] as const).map(([id, label]) =>
        <button key={id} onClick={() => navigate(id)} aria-current={screen === id ? "page" : undefined}>{label}</button>
      )}
    </nav>
    {screen === "home" ? <section className="transit-card" aria-labelledby="home-title">
      <span className="eyebrow">INICIO</span><h1 id="home-title">Hola, {session.profile.fullName}</h1>
      <p className="transit-muted">Tu último movimiento registrado:</p>
      {session.lastMovement ? <HistoryList items={[session.lastMovement]} /> :
        <p className="transit-empty">Todavía no registraste movimientos.</p>}
      <p className="transit-note">El escáner estará disponible cuando se habiliten las ubicaciones y sus códigos QR.</p>
    </section> : null}
    {screen === "history" ? <section className="transit-card" aria-labelledby="history-title">
      <span className="eyebrow">REGISTROS COMPARTIDOS</span><h1 id="history-title">Movimientos</h1>
      <p className="transit-muted">Historial general, del más reciente al más antiguo.</p>
      {items.length ? <HistoryList items={items} /> :
        historyPending ? <p role="status">Cargando movimientos…</p> : <HistoryList items={[]} />}
      {historyError ? <p className="transit-error" role="alert">{historyError}</p> : null}
      {historyError || cursor ? <button className="transit-secondary" disabled={historyPending}
        onClick={() => void fetchPage(items.length ? cursor ?? undefined : undefined)}>
        {historyPending ? "Cargando…" : historyError ? "Reintentar" : "Cargar más"}
      </button> : null}
    </section> : null}
    {screen === "account" ? <section className="transit-card" aria-labelledby="account-title">
      <span className="eyebrow">MI CUENTA</span><h1 id="account-title">Configuración</h1>
      <dl className="account-details"><dt>Usuario</dt><dd>{session.profile.username}</dd>
        <dt>Nombre</dt><dd>{session.profile.fullName}</dd>
        <dt>Correo</dt><dd>{session.profile.email}</dd></dl>
      <button className="transit-secondary" onClick={() => void signOut()} disabled={pending}>Cerrar sesión</button>
    </section> : null}
  </main>;
}
