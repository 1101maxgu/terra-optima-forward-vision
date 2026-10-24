-- GeoViva billing (Stripe). Run after 001_init.sql. A farm with no row here is on the Free plan.
-- Rows are written only by the Stripe webhook (server/routes/billing.ts); the farmer never edits them.

begin;

create table subscriptions (
  farm_id                 uuid primary key references farms on delete cascade,
  stripe_customer_id      text not null,
  stripe_subscription_id  text unique,
  status                  text not null,                  -- Stripe subscription status (active, past_due, canceled, ...)
  plan                    text not null default 'grower' check (plan in ('grower')),
  billing_interval        text check (billing_interval in ('month', 'year')),
  extra_sensors           integer not null default 0 check (extra_sensors >= 0),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  updated_at              timestamptz not null default now()
);
create index subscriptions_customer_idx on subscriptions (stripe_customer_id);

-- Webhook idempotency: Stripe retries deliveries, each event id is applied once.
create table stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

commit;

-- Supabase only, same idea as 002_supabase_rls.sql: members may read their plan, nobody writes from the client.
-- alter table subscriptions enable row level security;
-- alter table stripe_events  enable row level security;
-- create policy subscriptions_read on subscriptions for select using (geoviva_has_role(farm_id, array['owner','editor','viewer']));
