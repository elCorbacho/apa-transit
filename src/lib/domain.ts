import { z } from "zod";

const captureSchema = z.strictObject({
  qrPayload: z.string().regex(/^APA-TRANSIT:LOC:[0-9a-f-]{36}$/i),
  requestId: z.uuid()
});
const positionSchema = z.strictObject({
  recordedAt: z.iso.datetime({ offset: true }),
  id: z.uuid()
});
export type MovementPosition = z.infer<typeof positionSchema>;

export function parseCapture(input: unknown) {
  const capture = captureSchema.parse(input);
  const qrToken = z.uuid().parse(capture.qrPayload.slice("APA-TRANSIT:LOC:".length));
  return { qrToken, requestId: capture.requestId };
}

export function encodeCursor(position: MovementPosition): string {
  return Buffer.from(JSON.stringify(positionSchema.parse(position))).toString("base64url");
}

export function decodeCursor(cursor: string): MovementPosition {
  if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new Error("Invalid movement cursor.");
  }
  return positionSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
}

export function santiagoDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}

export function santiagoTime(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(new Date(value));
}
