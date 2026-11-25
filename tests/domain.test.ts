import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, parseCapture, santiagoDate, santiagoTime } from "../src/lib/domain";

const id = "00000000-0000-4000-8000-000000000001";
describe("movement contract", () => {
  it("accepts only the exact location payload and a capture UUID", () => {
    expect(parseCapture({ qrPayload: `APA-TRANSIT:LOC:${id}`, requestId: id })).toEqual({ qrToken: id, requestId: id });
    for (const qrPayload of [id, `https://invalid.example/${id}`, `APA-TRANSIT:LOC:${id}:extra`]) {
      expect(() => parseCapture({ qrPayload, requestId: id })).toThrow();
    }
    expect(() => parseCapture({ qrPayload: `APA-TRANSIT:LOC:${id}`, requestId: id, userId: id })).toThrow();
  });
  it("round trips the timestamp and ID without accepting malformed cursors", () => {
    const position = { recordedAt: "2026-11-25T12:00:00.123456Z", id };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
    for (const cursor of ["invalid", "a".repeat(513), Buffer.from('{"id":"invalid"}').toString("base64url")]) {
      expect(() => decodeCursor(cursor)).toThrow();
    }
  });
  it("renders the Santiago date rather than the UTC date around midnight", () => {
    expect(santiagoDate("2026-11-25T01:30:00Z")).toBe("2026-11-24");
    expect(santiagoTime("2026-11-25T01:30:00Z")).toContain("22:30");
  });
});
