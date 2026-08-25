export type DeferredModalTransition<T> = {
  readonly cancel: () => void;
  readonly complete: () => void;
  readonly schedule: (value: T) => void;
};

export function createDeferredModalTransition<T>({
  delayMs = 420,
  onComplete,
}: {
  readonly delayMs?: number;
  readonly onComplete: (value: T) => void;
}): DeferredModalTransition<T> {
  let hasPendingValue = false;
  let pendingValue: T | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clearFallback = () => {
    if (!timeout) return;
    clearTimeout(timeout);
    timeout = undefined;
  };

  const complete = () => {
    if (!hasPendingValue) return;
    const value = pendingValue as T;
    hasPendingValue = false;
    pendingValue = undefined;
    clearFallback();
    onComplete(value);
  };

  return {
    cancel: () => {
      hasPendingValue = false;
      pendingValue = undefined;
      clearFallback();
    },
    complete,
    schedule: (value) => {
      clearFallback();
      hasPendingValue = true;
      pendingValue = value;
      // iOS completes this from Modal.onDismiss. The timer is the Android and
      // interrupted-animation fallback so another native modal is never
      // presented while the first one is still leaving the hierarchy.
      timeout = setTimeout(complete, delayMs);
    },
  };
}
