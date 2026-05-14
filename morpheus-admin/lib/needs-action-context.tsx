"use client";

/**
 * NeedsActionContext — single source of truth for the "things that
 * need a manager's attention" data set (May 14 evening).
 *
 * The previous architecture had three independent subscriptions:
 *   - Sidebar (pendingCount + attentionCount, polled 60s)
 *   - LiveFeedPanel needs-action tab (its own requests + attentionShifts, polled 15s)
 *   - ShiftsList Needs action filter (its own list of requests + filtered shifts)
 *
 * Each fetched its own copy of the same Supabase data, with its own
 * realtime subscriber. They drifted out of sync — Gary saw "2 / 1 / 0"
 * on the same screen because:
 *   1. Supabase's read replica sometimes lags the primary by a beat
 *      after a DELETE — the first refetch after a realtime DELETE
 *      event can return stale rows.
 *   2. Different poll cadences (60s vs 15s) meant the three surfaces
 *      caught up at different times.
 *   3. Today-only vs all-dates filters diverged for future-dated items.
 *
 * This module unifies the data flow:
 *   - One Provider, mounted at AdminShell layout level.
 *   - One pair of subscribers (requests + shifts).
 *   - One poll interval (15 s) as the safety net.
 *   - Visibility + focus refetch covers backgrounded tabs.
 *   - Realtime events trigger an immediate refetch PLUS a short
 *     1 s and 3 s retry to handle replica lag.
 *   - Every consumer reads from the same state → identical counts
 *     update in the same React frame.
 *
 * Service-role callers (cron, /api/messages/send, etc) BYPASS RLS by
 * design — that path is unaffected.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  listPendingRequests,
  subscribeRequests,
  type PendingRequest,
} from "@/lib/requests-store";
import {
  listOpenAttentionShifts,
  subscribeShifts,
  type ShiftRow,
} from "@/lib/shifts-store";

export interface NeedsActionContextValue {
  /** All pending requested_shifts (any date). Same data the manager
   *  composer + inbox queries return. */
  requests: PendingRequest[];
  /** All shifts with attention='unable_to_attend' AND
   *  attention_resolved_at IS NULL. Any date. */
  attentionShifts: ShiftRow[];
  /** True once the initial fetch resolved. Use this to drive
   *  "Loading…" placeholders instead of guessing from count === 0. */
  loaded: boolean;
  /** Sum of pending requests + open attention shifts. The number the
   *  sidebar badge, the LiveFeedPanel pill, and the ShiftsList tab
   *  all display. Single derivation = no drift. */
  count: number;
  /** ms epoch of the most recent realtime event that bumped this
   *  data set. Drives the "LIVE" heartbeat indicator on the
   *  LiveFeedPanel header. null until the first event lands. */
  lastEventAt: number | null;
  /** Force a refresh on demand (e.g. after a manual write). */
  refresh: () => void;
}

const Ctx = createContext<NeedsActionContextValue | null>(null);

/**
 * Mount once at the AdminShell layout level. Every Sidebar /
 * LiveFeedPanel / ShiftsList instance below it reads from the same
 * value via useNeedsAction().
 */
export function NeedsActionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [attentionShifts, setAttentionShifts] = useState<ShiftRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  // Ref-cell guard so a chain of three quick realtime events doesn't
  // pile up nine in-flight refetches. We always honour the LATEST
  // request's result.
  const fetchSeq = useRef(0);

  const refresh = useCallback(
    async (viaRealtime = false): Promise<void> => {
      const mySeq = ++fetchSeq.current;
      const [r, a] = await Promise.all([
        listPendingRequests(),
        listOpenAttentionShifts(),
      ]);
      // If a newer refresh started between our fetch and our resolve,
      // discard our result — the newer one's state is the canonical
      // version. Prevents flicker between events arriving 50 ms apart.
      if (mySeq !== fetchSeq.current) return;
      setRequests(r);
      setAttentionShifts(a);
      setLoaded(true);
      if (viaRealtime) setLastEventAt(Date.now());
    },
    []
  );

  /**
   * Realtime event handler with replica-lag retries.
   *
   * Supabase emits postgres_changes after the primary commits, but
   * SELECT queries can hit a replica that hasn't replicated the
   * commit yet — particularly visible on DELETEs (the row still
   * appears in the response). Refetching at t+1s and t+3s catches
   * the new state in 99%+ of cases without us needing to know which
   * specific replica we hit.
   */
  const refreshWithRetry = useCallback(() => {
    void refresh(true);
    const t1 = window.setTimeout(() => void refresh(true), 1000);
    const t3 = window.setTimeout(() => void refresh(true), 3000);
    // Caller doesn't get the cleanup handle — the timeouts fire fast
    // enough that an unmount during this window is harmless (the
    // mySeq guard above drops the result if a newer refresh
    // happened, and setState on unmounted is a non-issue in React 18).
    void t1;
    void t3;
  }, [refresh]);

  useEffect(() => {
    void refresh();

    const unsubR = subscribeRequests(refreshWithRetry);
    const unsubS = subscribeShifts(refreshWithRetry);

    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    // 15 s polling safety net — covers the case where a websocket
    // dropped silently between page navs or after a long
    // backgrounded session.
    const poll = window.setInterval(() => void refresh(), 15_000);

    return () => {
      unsubR();
      unsubS();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
    };
  }, [refresh, refreshWithRetry]);

  const value: NeedsActionContextValue = {
    requests,
    attentionShifts,
    loaded,
    count: requests.length + attentionShifts.length,
    lastEventAt,
    refresh: () => {
      void refresh();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Hook for consumers. Returns the live data + count. Safe to call
 * outside the provider — falls back to zeroed state so a missing
 * wrap doesn't crash the page (drove me crazy debugging that once).
 */
export function useNeedsAction(): NeedsActionContextValue {
  const v = useContext(Ctx);
  if (!v) {
    return {
      requests: [],
      attentionShifts: [],
      loaded: false,
      count: 0,
      lastEventAt: null,
      refresh: () => {},
    };
  }
  return v;
}
