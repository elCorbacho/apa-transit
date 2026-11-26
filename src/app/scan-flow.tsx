"use client";

import { useEffect, useRef, useState } from "react";
import { ApiFailure, captureMovement, type CaptureAttempt, type Movement } from "@/lib/client-api";
import type { Html5Qrcode } from "html5-qrcode";

type ScanState = "idle" | "starting" | "scanning" | "registering" | "uncertain" |
  "invalid" | "rateLimited" | "cameraError" | "confirmed";

export function ScanPanel({ state, movement, onStart, onRetry, onReset, onClose }: {
  state: ScanState; movement: Movement | null;
  onStart: () => void; onRetry: () => void; onReset: () => void; onClose: () => void;
}) {
  return <section className="transit-card" aria-labelledby="scanner-title">
    <span className="eyebrow">REGISTRAR MOVIMIENTO</span>
    <h1 id="scanner-title">Escanear QR</h1>
    <p className="transit-muted">Apuntá la cámara al código de una ubicación autorizada.</p>
    <div id="scan-reader" className="scan-reader" aria-label="Vista de cámara" />
    {state === "idle" ? <button className="transit-primary" type="button" onClick={onStart}>Activar cámara</button> : null}
    {state === "starting" || state === "scanning" ?
      <p role="status">{state === "starting" ? "Solicitando cámara…" : "Buscando un código QR…"}</p> : null}
    {state === "registering" ? <p role="status">Registrando movimiento…</p> : null}
    {state === "cameraError" ? <div role="alert">
      <p>No se pudo acceder a la cámara. Revisá el permiso o probá en un dispositivo con cámara.</p>
      <button className="transit-secondary" type="button" onClick={onReset}>Volver a intentar</button>
    </div> : null}
    {state === "invalid" || state === "rateLimited" ? <div role="alert">
      <p>{state === "invalid" ? "El QR no se puede usar." : "Demasiados intentos. Esperá antes de volver a escanear."}</p>
      <button className="transit-secondary" type="button" onClick={onReset}>Volver a escanear</button>
    </div> : null}
    {state === "uncertain" ? <div role="alert">
      <p>El registro aún no se pudo confirmar. No escanees de nuevo antes de reintentar esta captura.</p>
      <button className="transit-secondary" type="button" onClick={onRetry}>Reintentar la misma captura</button>
    </div> : null}
    {state === "confirmed" && movement ? <div className="transit-confirmation" role="status">
      <h2>Movimiento confirmado</h2>
      <p><strong>{movement.locationName}</strong></p>
      <p>{movement.userName}</p>
      <time dateTime={movement.recordedAt}>{new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short"
      }).format(new Date(movement.recordedAt))}</time>
      <div><button className="transit-primary" type="button" onClick={onReset}>Escanear de nuevo</button></div>
    </div> : null}
    <button className="transit-secondary" type="button" onClick={onClose}>Volver a Inicio</button>
  </section>;
}

export default function ScanFlow({ onExpired, onCaptured, onClose }: {
  onExpired: () => void; onCaptured: (movement: Movement) => void; onClose: () => void;
}) {
  const [state, setState] = useState<ScanState>("idle");
  const [movement, setMovement] = useState<Movement | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const readerStarted = useRef(false);
  const ticket = useRef(0);
  const captureLock = useRef(false);
  const attempt = useRef<CaptureAttempt | null>(null);
  const mounted = useRef(false);

  function stopCamera() {
    ticket.current++;
    const active = scanner.current;
    scanner.current = null;
    if (active && readerStarted.current) {
      readerStarted.current = false;
      try { void active.stop().catch(() => {}); }
      catch { /* A stopped reader cannot hold an active camera. */ }
    }
  }

  useEffect(() => {
    mounted.current = true;
    function onVisibility() {
      if (!document.hidden) return;
      stopCamera();
      if (mounted.current) setState("idle");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      stopCamera();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function register(current: CaptureAttempt) {
    if (captureLock.current) return;
    captureLock.current = true;
    if (mounted.current) setState("registering");
    try {
      const result = await captureMovement(current);
      // Keep the home view current if the request finished after leaving the scanner.
      onCaptured(result);
      if (!mounted.current) return;
      attempt.current = null;
      setMovement(result);
      setState("confirmed");
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.status === 401) {
        onExpired();
      } else if (mounted.current && cause instanceof ApiFailure &&
        [400, 404, 409].includes(cause.status)) {
        attempt.current = null;
        setState("invalid");
      } else if (mounted.current && cause instanceof ApiFailure && cause.status === 429) {
        attempt.current = null;
        setState("rateLimited");
      } else if (mounted.current) {
        // An uncertain result keeps the same request ID for an idempotent retry.
        setState("uncertain");
      }
    } finally { captureLock.current = false; }
  }

  async function startCamera() {
    if (scanner.current || captureLock.current) return;
    setState("starting");
    const currentTicket = ++ticket.current;
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (!mounted.current || ticket.current !== currentTicket) return;
      const reader = new Html5Qrcode("scan-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false
      });
      scanner.current = reader;
      readerStarted.current = false;
      await reader.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 220 } },
        value => {
          if (!mounted.current || ticket.current !== currentTicket || captureLock.current) return;
          stopCamera();
          const current = { qrPayload: value, requestId: crypto.randomUUID() };
          attempt.current = current;
          void register(current);
        }, () => { /* A frame without a QR is expected. */ });
      if (!mounted.current || ticket.current !== currentTicket) {
        if (scanner.current === reader) scanner.current = null;
        try { await reader.stop(); }
        catch { /* Already stopped by a completed scan. */ }
        return;
      }
      readerStarted.current = true;
      setState("scanning");
    } catch {
      if (ticket.current !== currentTicket || !mounted.current) return;
      stopCamera();
      setState("cameraError");
    }
  }

  function reset() {
    stopCamera();
    attempt.current = null;
    setMovement(null);
    setState("idle");
  }

  return <ScanPanel state={state} movement={movement} onStart={() => void startCamera()}
    onRetry={() => { if (attempt.current) void register(attempt.current); }}
    onReset={reset} onClose={() => { stopCamera(); onClose(); }} />;
}
