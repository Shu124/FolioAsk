import type { Api } from "./documents";

/** Approximate foreground engagement, never billing or a productivity claim. */
export function trackActiveTime(
  workspaceId: string,
  api: Api,
  onUnavailable: () => void,
) {
  let previous = Date.now();
  let lastInput = previous;
  let disposed = false;
  const intervals = new Map<number, number>();
  const sending = new Set<number>();
  const input = () => {
    lastInput = Date.now();
  };
  const reset = () => {
    previous = Date.now();
  };
  for (const name of ["pointerdown", "keydown", "wheel", "touchstart"])
    window.addEventListener(name, input, { passive: true });
  window.addEventListener("blur", reset);
  window.addEventListener("focus", reset);
  document.addEventListener("visibilitychange", reset);
  const timer = window.setInterval(() => {
    const now = Date.now();
    const from = previous;
    previous = now;
    // Suspended timers never manufacture a backlog of active time.
    if (
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      now - from <= 2000 &&
      now > from
    ) {
      const until = Math.min(now, lastInput + 60000);
      for (let start = from; start < until;) {
        const bucket = Math.floor(start / 15000) * 15000;
        const end = Math.min(until, bucket + 15000);
        intervals.set(
          bucket,
          Math.min(15000, (intervals.get(bucket) ?? 0) + end - start),
        );
        start = end;
      }
    }
    for (const [bucket, milliseconds] of intervals) {
      if (now - bucket > 60000) {
        intervals.delete(bucket);
        continue;
      }
      if (bucket + 15000 > now || sending.has(bucket)) continue;
      sending.add(bucket);
      void api(`/workspaces/${workspaceId}/activity`, "POST", {
        bucket,
        milliseconds,
      })
        .then(() => {
          intervals.delete(bucket);
        })
        .catch(() => {
          // Retry the same bounded interval on a later tick, never add it twice.
          if (!disposed) onUnavailable();
        })
        .finally(() => sending.delete(bucket));
    }
  }, 1000);
  return () => {
    disposed = true;
    clearInterval(timer);
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"])
      window.removeEventListener(name, input);
    window.removeEventListener("blur", reset);
    window.removeEventListener("focus", reset);
    document.removeEventListener("visibilitychange", reset);
    intervals.clear();
  };
}
