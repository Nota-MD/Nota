function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Express the difference between two strings as one minimal replacement.
 *
 * The prefix and suffix never split a UTF-16 surrogate pair. The result can be
 * replayed as `old.slice(0, deleteStart) + insert + old.slice(deleteEnd)`.
 */
export function computeMostSmallChangeAction(
  oldText: string,
  newText: string,
): { deleteStart: number; deleteEnd: number; insert: string } {
  const short = Math.min(oldText.length, newText.length);

  let before = 0;
  while (before < short && oldText.charCodeAt(before) === newText.charCodeAt(before)) before++;
  while (
    before > 0 &&
    (isLowSurrogate(oldText.charCodeAt(before)) ||
      isLowSurrogate(newText.charCodeAt(before)))
  ) {
    if (
      isHighSurrogate(oldText.charCodeAt(before - 1)) ||
      isHighSurrogate(newText.charCodeAt(before - 1))
    ) {
      before--;
    } else {
      break;
    }
  }

  const canReadTail = () => tail < short - before;
  const tailSplitsPair = (text: string) => {
    const i = text.length - tail;
    return (
      i > 0 &&
      i < text.length &&
      isHighSurrogate(text.charCodeAt(i - 1)) &&
      isLowSurrogate(text.charCodeAt(i))
    );
  };

  let tail = 0;
  while (
    canReadTail() &&
    oldText.charCodeAt(oldText.length - 1 - tail) ===
      newText.charCodeAt(newText.length - 1 - tail)
  ) {
    tail++;
  }
  while (canReadTail() && (tailSplitsPair(oldText) || tailSplitsPair(newText))) tail++;

  return {
    deleteStart: before,
    deleteEnd: oldText.length - tail,
    insert: newText.slice(before, newText.length - tail),
  };
}
