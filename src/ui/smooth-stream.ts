/**
 * Visual release policy for plugin streams.
 *
 * Network chunks arrive in bursts. This policy releases code points at a
 * readable baseline rate and accelerates only enough to keep backlog below the
 * maximum visual delay.
 */

export const STREAM_BASE_CPMS = 54;
export const STREAM_MAX_DELAY_MS = 1400;

export interface StreamRelease {
  count: number;
  carry: number;
}

/**
 * Advance a visible code-point count toward the latest network snapshot.
 *
 * `carry` stores the fractional code point between animation frames. The
 * return value never moves backward and never exceeds `target`.
 */
export function nextStreamRelease(
  current: number,
  target: number,
  elapsedMs: number,
  carry = 0,
  backlogAgeMs = 0,
): StreamRelease {
  const safeCurrent = Math.max(0, Math.floor(current));
  const safeTarget = Math.max(0, Math.floor(target));
  if (safeCurrent >= safeTarget) {
    return { count: safeTarget, carry: 0 };
  }

  const elapsed = Math.max(0, Math.min(250, elapsedMs));
  const backlog = safeTarget - safeCurrent;
  const remaining = Math.max(16, STREAM_MAX_DELAY_MS - Math.max(0, backlogAgeMs));
  const deadlineRate = (backlog * 1000) / remaining;
  const rate = Math.max(STREAM_BASE_CPMS, deadlineRate);
  const pending = Math.max(0, carry) + (rate * elapsed) / 1000;
  let move = Math.floor(pending);
  if (elapsed >= 8 && move === 0) move = 1;

  return {
    count: Math.min(safeTarget, safeCurrent + move),
    carry: move === 0 ? pending : pending - move,
  };
}
