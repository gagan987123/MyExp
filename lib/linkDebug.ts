// Temporary Siri diagnostic: records every incoming deep-link URL so we
// can see on-screen whether iOS delivers it. Delete after intake works.
type Listener = () => void;

let lastURL: string | null = null;
const listeners = new Set<Listener>();

export function recordIncomingURL(url: string | null | undefined) {
  lastURL = url ?? null;
  listeners.forEach((l) => l());
}

export function getLastIncomingURL(): string | null {
  return lastURL;
}

export function subscribeIncomingURL(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
