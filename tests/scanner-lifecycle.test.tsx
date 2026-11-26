import { afterEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  states: [] as string[], hidden: false,
  onVisibility: undefined as undefined | (() => void),
  cleanup: undefined as undefined | (() => void),
  start: vi.fn<() => Promise<null>>(),
  stop: vi.fn<() => Promise<void>>()
}));
vi.mock("react", async importOriginal => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, (value: string) => runtime.states.push(value)],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (callback: () => (() => void)) => { runtime.cleanup = callback(); }
}));
vi.mock("html5-qrcode", () => ({
  Html5QrcodeSupportedFormats: { QR_CODE: 0 },
  Html5Qrcode: class {
    start = runtime.start;
    stop = runtime.stop;
  }
}));

import ScanFlow from "../src/app/scan-flow";

function panel() {
  vi.stubGlobal("document", {
    get hidden() { return runtime.hidden; },
    addEventListener: (_event: string, fn: () => void) => { runtime.onVisibility = fn; },
    removeEventListener: () => {}
  });
  return ScanFlow({ onExpired: vi.fn(), onCaptured: vi.fn(), onClose: vi.fn() });
}
async function flush() { await new Promise(done => setImmediate(done)); }

afterEach(() => {
  runtime.cleanup?.();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  runtime.states.length = 0;
  runtime.hidden = false;
  runtime.onVisibility = undefined;
  runtime.cleanup = undefined;
});

it("shows camera denial even when stop throws before the reader starts", async () => {
  runtime.start.mockRejectedValueOnce(new Error("Camera denied"));
  runtime.stop.mockImplementationOnce(() => { throw new Error("Cannot stop before start"); });
  panel().props.onStart();
  await flush();
  expect(runtime.states).toContain("cameraError");
});

it("never starts the camera when the tab hides while import is pending", async () => {
  runtime.stop.mockImplementation(() => { throw new Error("Cannot stop before start"); });
  panel().props.onStart();
  runtime.hidden = true;
  runtime.onVisibility?.();
  await flush();
  expect(runtime.start).not.toHaveBeenCalled();
});

it("releases the reader after a pending start resolves following a tab hide", async () => {
  let resolve!: (value: null) => void;
  runtime.start.mockReturnValueOnce(new Promise<null>(done => { resolve = done; }));
  runtime.stop.mockImplementationOnce(() => { throw new Error("Cannot stop before start"); })
    .mockResolvedValue(undefined);
  panel().props.onStart();
  await flush();
  expect(runtime.start).toHaveBeenCalledTimes(1);
  runtime.hidden = true;
  runtime.onVisibility?.();
  resolve(null);
  await flush();
  expect(runtime.stop).toHaveBeenCalledTimes(1);
  expect(runtime.states).toContain("idle");
});

it("releases a reader whose start resolves after unmount", async () => {
  let resolve!: (value: null) => void;
  runtime.start.mockReturnValueOnce(new Promise<null>(done => { resolve = done; }));
  runtime.stop.mockResolvedValue(undefined);
  panel().props.onStart();
  await flush();
  runtime.cleanup?.();
  resolve(null);
  await flush();
  expect(runtime.stop).toHaveBeenCalledTimes(1);
  expect(runtime.states).not.toContain("scanning");
});
