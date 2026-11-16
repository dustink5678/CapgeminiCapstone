import { fetchJson } from "./api";

const SESSION_KEY = "spark.sessionId";
const eventQueue = [];
const earlyQueue = [];
let flushTimer = null;
let sessionReady = null;

export function getStoredSessionId() {
  return sessionStorage.getItem(SESSION_KEY);
}

export async function ensureDemoSession() {
  if (sessionReady) return sessionReady;

  sessionReady = (async () => {
    const existing = getStoredSessionId();
    if (existing) return existing;

    const started = await fetchJson("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ channel: "web", device: "desktop", entryPoint: "direct" }),
    });
    sessionStorage.setItem(SESSION_KEY, started.sessionId);
    return started.sessionId;
  })();

  try {
    const sessionId = await sessionReady;
    // Drain events that arrived before the session id existed.
    if (earlyQueue.length) {
      for (const event of earlyQueue.splice(0, earlyQueue.length)) {
        eventQueue.push({ ...event, sessionId });
      }
      scheduleFlush();
    }
    return sessionId;
  } catch (err) {
    sessionReady = null;
    throw err;
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents();
  }, 1200);
}

export function queueEvent(event) {
  const sessionId = getStoredSessionId();
  if (!sessionId) {
    earlyQueue.push(event);
    ensureDemoSession().catch(() => {});
    return;
  }
  eventQueue.push({ ...event, sessionId });
  scheduleFlush();
}

async function flushEvents() {
  if (!eventQueue.length) return;
  const events = eventQueue.splice(0, eventQueue.length);
  try {
    await fetchJson("/api/events", {
      method: "POST",
      body: JSON.stringify({ events }),
    });
  } catch {
    // Demo should not break if event ingest fails.
  }
}

/** Sync drain for pagehide — pairs with sendBeacon so we don't drop the batch. */
function takePendingEventsPayload(sessionId) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const events = eventQueue.splice(0, eventQueue.length);
  if (earlyQueue.length && sessionId) {
    for (const event of earlyQueue.splice(0, earlyQueue.length)) {
      events.push({ ...event, sessionId });
    }
  }
  return events;
}

export async function endDemoSession() {
  const sessionId = getStoredSessionId();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushEvents();
  if (!sessionId) return null;
  sessionStorage.removeItem(SESSION_KEY);
  sessionReady = null;
  try {
    return await fetchJson(`/api/sessions/${sessionId}/end`, { method: "POST", body: "{}" });
  } catch {
    return null;
  }
}

/** Mock checkout: flush events, place order + end session as purchased, clear local session. */
export async function checkoutDemoSession() {
  const sessionId = getStoredSessionId();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushEvents();
  if (!sessionId) throw new Error("No active session");
  const result = await fetchJson("/api/checkout", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
  sessionStorage.removeItem(SESSION_KEY);
  sessionReady = null;
  return result;
}

/** Best-effort end on tab hide — finite one-shot, no polling. */
export function installSessionEndOnLeave() {
  const handler = () => {
    const sessionId = getStoredSessionId();
    if (!sessionId) return;

    const pending = takePendingEventsPayload(sessionId);
    if (pending.length && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/events",
        new Blob([JSON.stringify({ events: pending })], { type: "application/json" }),
      );
    }

    const url = `/api/sessions/${sessionId}/end`;
    const payload = JSON.stringify({});
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(url, {
        method: "POST",
        body: payload,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      });
    }
    sessionStorage.removeItem(SESSION_KEY);
    sessionReady = null;
  };
  window.addEventListener("pagehide", handler);
  return () => window.removeEventListener("pagehide", handler);
}
