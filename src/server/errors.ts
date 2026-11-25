import "server-only";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function invalidSession(): ApiError {
  return new ApiError(401, "SESSION_INVALID", "Please sign in again.");
}
