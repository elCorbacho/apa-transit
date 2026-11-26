"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiFailure, createLocation, downloadLocationQR, editLocation, listLocations, type Location
} from "@/lib/client-api";

export function LocationsPanel({ items, pending, onCreate, onRename, onToggle, onDownload }: {
  items: Location[]; pending: boolean;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onRename: (event: FormEvent<HTMLFormElement>, location: Location) => void;
  onToggle: (location: Location) => void;
  onDownload: (location: Location) => void;
}) {
  return <div className="location-panel">
    <h3>Ubicaciones</h3>
    <form className="location-form" onSubmit={onCreate}>
      <label htmlFor="new-location">Nueva ubicación</label>
      <div><input id="new-location" name="name" required maxLength={120} disabled={pending} />
        <button className="transit-secondary" type="submit" disabled={pending}>Agregar</button></div>
    </form>
    {items.length === 0 ? <p className="transit-empty">Todavía no hay ubicaciones.</p> : null}
    <ul className="location-list">{items.map(location =>
      <li key={location.id}>
        <strong>{location.name}</strong>
        <span>{location.isActive ? "Activa" : "Inactiva"}</span>
        <form className="location-form" onSubmit={event => onRename(event, location)}>
          <label htmlFor={`location-${location.id}`}>Nuevo nombre de {location.name}</label>
          <div><input id={`location-${location.id}`} name="name" required maxLength={120} disabled={pending} />
            <button className="transit-secondary" type="submit" disabled={pending}>Renombrar</button></div>
        </form>
        <div className="location-actions">
          <button className="transit-secondary" type="button" disabled={pending}
            onClick={() => onToggle(location)}>{location.isActive ? "Desactivar" : "Reactivar"}</button>
          <button className="transit-secondary" type="button" disabled={pending}
            onClick={() => onDownload(location)}>Descargar QR</button>
        </div>
      </li>
    )}</ul>
  </div>;
}

export default function LocationManager({ onExpired }: { onExpired: () => void }) {
  const [items, setItems] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const panelGeneration = useRef(0);

  function deny(error: unknown) {
    if (error instanceof ApiFailure && error.status === 401) {
      onExpired();
      return true;
    }
    setError("No se pudo completar la operación. Comprobá el estado antes de reintentar.");
    return false;
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await listLocations();
      setItems(result.items);
    } catch (cause) {
      deny(cause);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    panelGeneration.current++;
    void refresh();
    return () => { panelGeneration.current++; };
  }, []);

  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try { await work(); }
    catch (cause) { deny(cause); }
    finally { lock.current = false; setPending(false); }
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    void perform(async () => {
      const location = await createLocation(name);
      setItems(current => [...current, location].sort((a, b) => a.name.localeCompare(b.name)));
      form.reset();
    });
  }

  function onRename(event: FormEvent<HTMLFormElement>, location: Location) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    void perform(async () => {
      const updated = await editLocation(location.id, { name });
      setItems(current => current.map(item => item.id === updated.id ? updated : item)
        .sort((a, b) => a.name.localeCompare(b.name)));
      form.reset();
    });
  }

  function onToggle(location: Location) {
    if (location.isActive && !window.confirm(`¿Desactivar ${location.name}? No se podrán registrar nuevos movimientos en esta ubicación.`)) return;
    void perform(async () => {
      const updated = await editLocation(location.id, { isActive: !location.isActive });
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
    });
  }

  function onDownload(location: Location) {
    const generation = panelGeneration.current;
    void perform(async () => {
      const blob = await downloadLocationQR(location.id);
      // A completed request from a former admin panel must not trigger a download.
      if (generation !== panelGeneration.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `apa-transit-location-${location.id}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  }

  return <section className="location-manager" aria-label="Administración de ubicaciones">
    {loading ? <p role="status">Cargando ubicaciones…</p> :
      <LocationsPanel items={items} pending={pending} onCreate={onCreate}
        onRename={onRename} onToggle={onToggle} onDownload={onDownload} />}
    {error ? <div><p className="transit-error" role="alert">{error}</p>
      <button className="transit-secondary" type="button" onClick={() => void refresh()}
        disabled={loading || pending}>Volver a cargar</button></div> : null}
  </section>;
}
