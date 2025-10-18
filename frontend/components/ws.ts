export function computeWsUrl(path: string): string {
  const isBrowser = typeof window !== "undefined";
  const proto = isBrowser && window.location.protocol === "https:" ? "wss" : "ws";
  let host = "localhost:8000";
  if (isBrowser) {
    // In dev, the frontend runs on localhost:3000 and backend on 8000.
    // In other environments, use current host.
    if (window.location.hostname === "localhost" && window.location.port === "3000") {
      host = "localhost:8000";
    } else {
      host = window.location.host;
    }
  }
  return `${proto}://${host}${path}`;
}