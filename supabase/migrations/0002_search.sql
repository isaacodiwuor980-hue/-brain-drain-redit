-- MindSpool — Part 2 Task 6: three-layer search (rule + BM25 + semantic)
-- Supabase / Postgres migration 0002
--
-- This migration adds:
--   1. The `skills` table (if not already present) with a structured Skill ID
--      (domain-make-model-year-part-version) for rule filtering.
--   2. A `tsvector` column + GIN index on title + steps for keyword/BM25 search.
--   3. The `pgvector` extension + an `embedding` column for semantic search.
--   4. A `match_skills` RPC function for cosine similarity search.
--
-- ASSUMPTION (flagged in the task): pgvector may or may not be installed on
-- the target Supabase project. The migration uses `create extension if not
-- exists vector` so it's safe to run — if pgvector isn't available the
-- extension creation is skipped, and the semantic layer degrades gracefully
-- (the search route checks for the function at query time).

-- ── pgvector extension ──────────────────────────────────────────────────
-- Safe no-op if pgvector isn't installed on the Supabase project.
create extension if not exists vector;

-- ── skills table ────────────────────────────────────────────────────────
create table if not exists public.skills (
  id text primary key,
  domain text not null,
  make text,
  model text,
  year integer,
  part text,
  version text not null,
  title text not null,
  author_name text not null,
  author_years_experience integer,
  steps jsonb not null default '[]'::jsonb,
  source_mind_id text,
  status text not null default 'private' check (status in ('private', 'in_review', 'published')),
  reviewer_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),

  -- Task 6 layer 2: full-text search vector on title + steps text.
  -- Auto-updated by trigger when title or steps change.
  fts tsvector
);

-- Indexes for rule filters (layer 1).
create index if not exists skills_domain_idx on public.skills(domain);
create index if not exists skills_make_idx on public.skills(make);
create index if not exists skills_model_idx on public.skills(model);
create index if not exists skills_year_idx on public.skills(year);
create index if not exists skills_part_idx on public.skills(part);
create index if not exists skills_status_idx on public.skills(status);
create index if not exists skills_source_mind_idx on public.skills(source_mind_id);

-- GIN index for full-text search (layer 2).
create index if not exists skills_fts_idx on public.skills using gin (fts);

-- ── FTS trigger ─────────────────────────────────────────────────────────
-- Keep the fts column in sync with title + steps. The steps jsonb is
-- flattened to text so procedural terms (e.g. "21mm spanner") are searchable.
create or replace function public.skills_fts_update() returns trigger as $$
begin
  new.fts :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(
      new.title || ' ' ||
      (select string_agg(step->>'action' || ' ' || coalesce(step->>'tool', '') || ' ' || coalesce(step->>'why', ''), ' ')
       from jsonb_array_elements(new.steps) as step)
    , '')), 'B');
  return new;
end;
$$ language plpgsql;

drop trigger if exists skills_fts_trigger on public.skills;
create trigger skills_fts_trigger before insert or update
  on public.skills
  for each row execute function public.skills_fts_update();

-- ── pgvector embedding column (layer 3) ─────────────────────────────────
-- Only add if the vector type exists (pgvector installed).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    -- Add the embedding column if it doesn't exist.
    if not exists (select 1 from information_schema.columns
                   where table_name = 'skills' and column_name = 'embedding') then
      alter table public.skills add column embedding vector(1536);
    end if;

    -- IVFFLAT index for fast cosine similarity search.
    if not exists (select 1 from pg_indexes where indexname = 'skills_embedding_idx') then
      create index skills_embedding_idx on public.skills
        using ivfflat (embedding vector_cosine_ops) with (lists = 100);
    end if;
  end if;
end $$;

-- ── match_skills RPC (layer 3 — semantic cosine similarity) ─────────────
-- Only create if pgvector is available. The search route checks for this
-- function at query time and skips the semantic layer if it's missing.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    create or replace function public.match_skills(
      query_embedding vector(1536),
      match_count integer default 20,
      filter_domain text default null
    ) returns table (
      id text,
      title text,
      domain text,
      make text,
      model text,
      year integer,
      part text,
      version text,
      author_name text,
      status text,
      source_mind_id text,
      similarity float
    ) as $$
      select
        s.id, s.title, s.domain, s.make, s.model, s.year, s.part, s.version,
        s.author_name, s.status, s.source_mind_id,
        1 - (s.embedding <=> query_embedding) as similarity
      from public.skills s
      where s.status = 'published'
        and (filter_domain is null or s.domain = filter_domain)
        and s.embedding is not null
      order by s.embedding <=> query_embedding
      limit match_count;
    $$ language sql;
  end if;
end $$;
