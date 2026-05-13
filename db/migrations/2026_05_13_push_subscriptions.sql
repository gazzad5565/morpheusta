-- Web Push subscriptions table — one row per (rep, device).
--
-- The browser's PushSubscription object is what we save:
--   - endpoint:  the push service URL (FCM / Mozilla / Apple)
--   - p256dh:    the user-public key from the keys.p256dh field
--   - auth:      the auth secret from the keys.auth field
--
-- One rep can have multiple subscriptions (phone PWA + iPad PWA, etc).
-- We key on endpoint UNIQUE so resubscribing the same browser updates
-- the row (last_seen_at bumps) rather than spawning duplicates.
--
-- Cleanup: the admin send endpoint deletes rows it gets a 410 Gone on,
-- so dead subscriptions self-prune. No background sweep needed.

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_rep_idx
  ON push_subscriptions(rep_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Reps can read their own subscriptions (powers the "Notifications
-- enabled on N devices" UI on /profile).
DROP POLICY IF EXISTS push_subscriptions_select_own ON push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT TO authenticated
  USING (rep_id = auth.uid());

-- Reps can insert subscriptions where rep_id = themselves.
DROP POLICY IF EXISTS push_subscriptions_insert_own ON push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (rep_id = auth.uid());

-- Reps can update their own (bumps last_seen_at on resubscribe).
DROP POLICY IF EXISTS push_subscriptions_update_own ON push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (rep_id = auth.uid())
  WITH CHECK (rep_id = auth.uid());

-- Reps can delete their own (powers the "Disable notifications"
-- button + browser-side unsubscribe cleanup).
DROP POLICY IF EXISTS push_subscriptions_delete_own ON push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON push_subscriptions
  FOR DELETE TO authenticated
  USING (rep_id = auth.uid());

-- The admin send endpoint uses the service-role key (bypasses RLS),
-- so we don't need a manager-read policy here. Add one later if
-- /reps/[id] grows a "subscriptions" debug section.

COMMIT;
