/**
 * noop.ts — Stubs for Tauri-specific APIs that have no web equivalent.
 *
 * Import these instead of @tauri-apps/api/window, @tauri-apps/api/event,
 * and @tauri-apps/plugin-opener.
 */

// ── @tauri-apps/api/window replacement ────────────────────────────────────

type UnlistenFn = () => void;

class WebAppWindow {
  async destroy(): Promise<void> {
    console.warn("[ofm-pwa] window.destroy() is a no-op in the web version.");
  }

  onCloseRequested(_handler: (event: { preventDefault(): void }) => void): Promise<UnlistenFn> {
    window.addEventListener("beforeunload", (e) => { e.preventDefault(); });
    return Promise.resolve(() => {});
  }
}

export function getCurrentWindow(): WebAppWindow {
  return new WebAppWindow();
}

// ── @tauri-apps/api/event replacement ─────────────────────────────────────

type EventCallback<T> = (event: { payload: T }) => void;

const listeners = new Map<string, Set<EventCallback<unknown>>>();

export function listen<T>(
  eventName: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  listeners.get(eventName)!.add(handler as EventCallback<unknown>);
  return Promise.resolve(() => {
    listeners.get(eventName)?.delete(handler as EventCallback<unknown>);
  });
}

export function emit<T>(eventName: string, payload: T): void {
  listeners.get(eventName)?.forEach((handler) => handler({ payload }));
}

// ── @tauri-apps/plugin-opener replacement ─────────────────────────────────

export function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}
