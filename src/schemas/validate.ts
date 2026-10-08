import type { z } from 'zod';
import { validationError, type FieldErrors } from '../utils/errors.js';

/** Parses untrusted input with a zod schema, converting failures into a field-level 422 error. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    fields[key] ??= issue.message;
  }
  throw validationError(fields);
}
