// Idempotency keys to prevent double-processing webhook retries.
// Key design: `{delivery_id}:{event_type}`. Backed by Upstash Redis in live
// mode (SETNX with TTL); falls back to an in-memory Set otherwise.

const seen = new Set<string>();
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export async function alreadyProcessed(key: string): Promise<boolean> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      // SET key 1 NX EX 86400 -> returns "OK" if set, null if it already existed
      const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}/1/NX/EX/86400`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
      const data = (await r.json()) as { result: string | null };
      return data.result === null; // null => key already existed => duplicate
    } catch {
      // fall through to memory
    }
  }
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

export function idempotencyKey(deliveryId: string, eventType: string): string {
  return `${deliveryId}:${eventType}`;
}
