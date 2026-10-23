import { ApiError } from '../src/http';

/** Turn a throwing call into a plain {status, code} record for matchers. */
export async function apiErrorFrom(
  fn: () => unknown | Promise<unknown>
): Promise<{ status: number; code: string }> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, code: error.code };
    throw new Error(`expected ApiError, got: ${String(error)}`);
  }
  throw new Error('expected ApiError but nothing was thrown');
}
