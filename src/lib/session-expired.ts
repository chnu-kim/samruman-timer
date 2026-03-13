let fired = false;

export function fireSessionExpired() {
  if (fired) return;
  fired = true;
  window.dispatchEvent(new CustomEvent("session-expired"));
}

export function onSessionExpired(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("session-expired", handler);
  return () => window.removeEventListener("session-expired", handler);
}
