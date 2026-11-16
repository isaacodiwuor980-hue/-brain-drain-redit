-- Phase 6 + 7 — Phone + Email contact discovery
--
-- Adds hashed contact-matching columns to profiles. Only one-way hashes
-- are stored — raw phone/email never leaves the client.

alter table public.profiles
  add column if not exists salt text;

alter table public.profiles
  add column if not exists phone_hash text;

create index if not exists profiles_phone_hash_idx
  on public.profiles(phone_hash)
  where phone_hash is not null;

alter table public.profiles
  add column if not exists email_hash text;

create index if not exists profiles_email_hash_idx
  on public.profiles(email_hash)
  where email_hash is not null;

comment on column public.profiles.phone_hash is
  'SHA-256(normalized_phone + salt). NULL if user did not opt into phone contact discovery.';
comment on column public.profiles.email_hash is
  'SHA-256(lowercase_email + salt). NULL if user did not opt into email contact discovery.';
comment on column public.profiles.salt is
  'Per-user 32-byte random salt (base64). Generated client-side at signup.';
