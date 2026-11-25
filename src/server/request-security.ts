import "server-only";

// Cross-origin browser clients cannot set this header without a successful
// preflight. API handlers must not opt into cross-origin CORS.
export function requireMutationOrigin(request: Request, allowedOrigin: string) {
  if (request.headers.get("origin") !== allowedOrigin
      || request.headers.get("x-apa-csrf") !== "1"
      || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("Request origin denied.");
  }
}
