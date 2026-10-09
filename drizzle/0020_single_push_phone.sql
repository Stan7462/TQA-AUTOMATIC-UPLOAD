ALTER TABLE push_accounts ADD COLUMN active_subscription_id TEXT;
CREATE UNIQUE INDEX push_accounts_active_subscription_unique ON push_accounts(active_subscription_id) WHERE active_subscription_id IS NOT NULL;
