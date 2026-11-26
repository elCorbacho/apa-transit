import { afterEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  download: vi.fn(), list: vi.fn().mockResolvedValue({ items: [] }),
  createURL: vi.fn().mockReturnValue("blob:synthetic"),
  click: vi.fn(), revoke: vi.fn(), timer: vi.fn(),
  stateIndex: 0, cleanup: undefined as undefined | (() => void)
}));
vi.mock("react", async importOriginal => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [runtime.stateIndex++ === 1 ? false : initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (callback: () => undefined | (() => void)) => { runtime.cleanup = callback(); }
}));
vi.mock("../src/lib/client-api", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/lib/client-api")>()),
  listLocations: runtime.list,
  downloadLocationQR: runtime.download
}));

import LocationManager from "../src/app/location-manager";
const location = { id: "11111111-1111-4111-8111-111111111111", name: "Synthetic Room", isActive: true };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  runtime.stateIndex = 0;
  runtime.cleanup = undefined;
});

it("does not start a QR download after the admin panel unmounts on logout", async () => {
  let resolve!: (blob: Blob) => void;
  runtime.download.mockReturnValueOnce(new Promise<Blob>(done => { resolve = done; }));
  vi.stubGlobal("URL", { createObjectURL: runtime.createURL, revokeObjectURL: runtime.revoke });
  vi.stubGlobal("document", { createElement: () => ({ click: runtime.click }) });
  vi.stubGlobal("window", { setTimeout: runtime.timer });
  const panel = LocationManager({ onExpired: vi.fn() });
  panel.props.children[0].props.onDownload(location);
  expect(runtime.download).toHaveBeenCalledWith(location.id);
  runtime.cleanup?.();
  resolve(new Blob(["synthetic PNG"]));
  await new Promise(done => setImmediate(done));
  expect(runtime.createURL).not.toHaveBeenCalled();
  expect(runtime.click).not.toHaveBeenCalled();
});
