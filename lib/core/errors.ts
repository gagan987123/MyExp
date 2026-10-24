export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class DatabaseError extends Error {}

export function toUserMessage(error: unknown): never {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    throw error;
  }
  throw new DatabaseError("Something went wrong saving your expense.");
}
