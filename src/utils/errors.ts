export type FieldErrors = Record<string, string>;

/** Errors thrown by services. The error handler maps them to HTTP responses / HTML fragments. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(403, 'FORBIDDEN', message);
export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
export const validationError = (fields: FieldErrors, message = 'Please correct the highlighted fields.') =>
  new AppError(422, 'VALIDATION', message, fields);
export const tooManyRequests = (retryAfter: number) =>
  new AppError(
    429,
    'RATE_LIMITED',
    `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
  );
