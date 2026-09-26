-- Passport Social Dashboard — Supabase (PostgreSQL) schema
-- Run this in the Supabase SQL editor before starting the backend for the first time.
-- Matches every column written by the scrapers (YouTube, Reddit, Bluesky), the
-- clustering pass (clusterPosts.js), and the API controllers.

create table if not exists posts (
    id                bigint generated always as identity primary key,

    -- Identity / source
    platform          text not null,              -- 'youtube' | 'reddit' | 'bluesky'
    post_id           text not null,               -- platform-native id (video id, GUID, AT URI)
    creator_name      text,
    creator_handle    text,

    -- Content
    original_text     text,
    post_url          text,
    published_at      timestamptz,

    -- NLP pipeline output
    language          text,                        -- ISO 639-3 code from franc
    region            text,
    category          text,
    sentiment         text,                        -- 'Positive' | 'Neutral' | 'Negative'
    summary           text,
    is_gibberish      boolean not null default false,
    is_relevant       boolean not null default true,

    -- Clustering (crypto.randomUUID(), null until a clustering pass runs)
    cluster_id        text,

    -- Structured data
    engagement        jsonb default '{}'::jsonb,    -- platform-specific counts (views/likes/comments/reposts)
    translations      jsonb default '{}'::jsonb,    -- cache of on-demand translations, keyed by language name
    raw_data          jsonb,                         -- original scraper payload, kept for debugging/reprocessing

    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    -- Matches the scrapers' upsert onConflict key
    constraint posts_platform_post_id_key unique (platform, post_id)
);

-- Read-endpoint filters always include is_relevant + is_gibberish; the feed
-- defaults to sorting/filtering on published_at, and platform/category/cluster
-- are common filter/group-by columns.
create index if not exists idx_posts_published_at on posts (published_at desc);
create index if not exists idx_posts_platform on posts (platform);
create index if not exists idx_posts_category on posts (category);
create index if not exists idx_posts_cluster_id on posts (cluster_id);
create index if not exists idx_posts_relevant_gibberish on posts (is_relevant, is_gibberish);
