// Services throw AppError. The HTTP layer turns it into a JSON error response,
// the WebSocket layer into an { type: "error" } frame.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Login required');

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const notMember = () => new AppError(403, 'NOT_MEMBER', 'Join the room first');

export const badRequest = (code: string, message: string) => new AppError(400, code, message);

export const rateLimited = () => new AppError(429, 'RATE_LIMITED', 'You are sending messages too fast');
