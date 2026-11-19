-- Online booking requests are saved with an identity.
--
-- The public booking site calls request_online_booking() from its server with
-- the service-role key. In one transaction it:
--   1. finds the stylist (BookingProfiles.user_id) from the booking slug,
--   2. reuses that stylist's identity for the requester when the match is
--      unambiguous, or creates one with is_client = false,
--   3. makes sure the identity has its IdentityContacts, IdentityPreferences
--      and IdentitySMSConsent rows, and
--   4. inserts the requested appointment linked to that identity.
--
-- Requires 20261117120000_client_identities.sql (one contact, preference and
-- consent row per identity, and Appointments.identity_id).
--
-- Nothing here sends texts or writes ReminderJobs. The app queues the booking
-- approved/denied texts when the stylist responds to the request.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema if not exists booking_private;
revoke all on schema booking_private from public, anon, authenticated;

-- Retried submissions --------------------------------------------------------
-- The site sends the same request key when it retries a submission, so a
-- retry returns the appointment already saved instead of adding another.
-- Kept outside the API schema: a key can be exchanged for a photo upload
-- permission on its appointment, so it must never be readable.

create table if not exists booking_private.request_keys (
  request_key uuid primary key,
  appointment_id bigint not null
    references public."Appointments"(appointment_id) on delete cascade,
  fingerprint text not null,
  created_at timestamp with time zone default now() not null
);
revoke all on table booking_private.request_keys from public, anon, authenticated;

-- Matching helpers -------------------------------------------------------------
-- The same rules the app uses for booking requests (booking_client_match.dart
-- and phone_number.dart), so both sides agree on who a requester is.

-- Digits used to compare phones; a leading US 1 is dropped.
create or replace function booking_private.phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(d) = 11 and left(d, 1) = '1' then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s
$$;

-- Ignores case, spacing and punctuation.
create or replace function booking_private.name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]', '', 'g')
$$;

create or replace function booking_private.email_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_email, '')))
$$;

-- 'exact': same first + last name. 'compatible': one first name starts with
-- the other and the last names share a part (or one is missing).
-- 'different': anything else.
create or replace function booking_private.name_match(
  p_first text,
  p_last text,
  p_other_first text,
  p_other_last text
)
returns text
language sql
immutable
set search_path = ''
as $$
  with k as (
    select
      booking_private.name_key(p_first) as f,
      booking_private.name_key(p_last) as l,
      booking_private.name_key(p_other_first) as cf,
      booking_private.name_key(p_other_last) as cl,
      array(
        select booking_private.name_key(part)
        from regexp_split_to_table(coalesce(p_last, ''), '[\s-]+') part
        where booking_private.name_key(part) <> ''
      ) as lp,
      array(
        select booking_private.name_key(part)
        from regexp_split_to_table(coalesce(p_other_last, ''), '[\s-]+') part
        where booking_private.name_key(part) <> ''
      ) as clp
  )
  select case
    when f <> '' and f || l = cf || cl then 'exact'
    when f <> '' and cf <> ''
      and (starts_with(f, cf) or starts_with(cf, f))
      and (
        cardinality(lp) = 0 or cardinality(clp) = 0
        or l = cl or lp && clp
      )
      then 'compatible'
    else 'different'
  end
  from k
$$;

revoke all on function booking_private.phone_digits(text) from public;
revoke all on function booking_private.name_key(text) from public;
revoke all on function booking_private.email_key(text) from public;
revoke all on function booking_private.name_match(text, text, text, text)
  from public;

-- The booking request -----------------------------------------------------
-- p_request holds:
--   stylist_slug, first_name, last_name, phone (E.164, or null), email (or
--   null), sms_consent (the requester's own opt-in), services,
--   appointment_date, appointment_start_time, appointment_end_time, notes,
--   price.
-- The caller (the site's server) has already checked the service and the
-- requested time. Returns the appointment_id.
--
-- An existing identity is reused only when exactly one of the stylist's
-- identities clearly is the requester:
--   * same name and the same phone, or the same email when that identity has
--     no phone on file (or the request has none), or
--   * a compatible name ("Alex" / "Alexander") and the same phone and email.
-- Ties, a matching name alone, and people who share a phone or email under a
-- different name all get a new identity, which the stylist can merge later.
-- Existing names, contacts, preferences, is_client and opt-outs are kept;
-- only missing contact details are filled in, and an explicit opt-in records
-- consent.

create or replace function public.request_online_booking(
  p_request_key uuid,
  p_request jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := nullif(btrim(p_request->>'stylist_slug'), '');
  v_first text := nullif(btrim(p_request->>'first_name'), '');
  v_last text := nullif(btrim(p_request->>'last_name'), '');
  v_phone text := nullif(btrim(p_request->>'phone'), '');
  v_email text := nullif(btrim(p_request->>'email'), '');
  v_digits text;
  v_email_key text;
  v_consent boolean;
  v_fingerprint text;
  v_owner uuid;
  v_identity uuid;
  v_appointment bigint;
  v_existing record;
  v_lock text;
begin
  if p_request_key is null then
    raise exception 'A request key is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object' then
    raise exception 'p_request must be a JSON object' using errcode = '22023';
  end if;
  if v_slug is null or v_first is null or v_last is null then
    raise exception 'A stylist and the requester''s name are required.'
      using errcode = '22023';
  end if;
  if length(v_first) > 100 or length(v_last) > 100 then
    raise exception 'Names must be 100 characters or fewer.'
      using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone numbers must be in international format.'
      using errcode = '22023';
  end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+$') then
    raise exception 'The email address is not valid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_request->'sms_consent') is distinct from 'boolean' then
    raise exception 'sms_consent must be true or false.' using errcode = '22023';
  end if;

  v_digits := booking_private.phone_digits(v_phone);
  v_email_key := booking_private.email_key(v_email);
  -- Consent is to texts at a number, so there is none without one.
  v_consent := (p_request->>'sms_consent')::boolean and v_phone is not null;
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array(
    v_slug, v_first, v_last, v_phone, v_email_key,
    p_request->>'services',
    p_request->>'appointment_date',
    p_request->>'appointment_start_time'
  )::text, 'UTF8')), 'hex');

  -- A retry waits for the attempt it repeats, then returns its appointment.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('blendiq.booking_request:' || p_request_key::text, 0)
  );
  select k.appointment_id, k.fingerprint into v_existing
  from booking_private.request_keys k
  where k.request_key = p_request_key;
  if found then
    if v_existing.fingerprint <> v_fingerprint then
      raise exception 'This request key was already used for a different booking.'
        using errcode = 'PT409';
    end if;
    return v_existing.appointment_id;
  end if;

  select p.user_id into v_owner
  from public."BookingProfiles" p
  where p.slug = v_slug;
  if v_owner is null then
    raise exception 'This stylist is not accepting online bookings.'
      using errcode = 'PT404';
  end if;

  -- Requests from the same person resolve one at a time, so simultaneous
  -- submissions can't each create an identity. Sorted to avoid deadlocks.
  for v_lock in
    select k from unnest(array[
      case when length(v_digits) >= 7 then 'phone:' || v_digits end,
      case when v_email_key <> '' then 'email:' || v_email_key end
    ]) k
    where k is not null
    order by k
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'blendiq.booking_identity:' || v_owner::text || ':' || v_lock, 0
    ));
  end loop;

  with candidates as (
    select
      i.identity_id,
      length(v_digits) >= 7
        and booking_private.phone_digits(c.phone) = v_digits as phone_matches,
      v_email_key <> ''
        and booking_private.email_key(c.email) = v_email_key as email_matches,
      length(booking_private.phone_digits(c.phone)) < 7 as no_phone_on_file,
      booking_private.name_match(v_first, v_last, i.first_name, i.last_name) as name
    from public."Identities" i
    join public."IdentityContacts" c on c.identity_id = i.identity_id
    where i.user_id = v_owner
      and (
        (length(v_digits) >= 7
          and booking_private.phone_digits(c.phone) = v_digits)
        or (v_email_key <> ''
          and booking_private.email_key(c.email) = v_email_key)
      )
  ),
  linkable as (
    select
      identity_id,
      phone_matches::int + email_matches::int as contact_score,
      case name when 'exact' then 2 else 1 end as name_score
    from candidates
    where
      (name = 'exact' and (
        phone_matches
        or (email_matches and (no_phone_on_file or length(v_digits) < 7))
      ))
      or (name = 'compatible' and phone_matches and email_matches)
  ),
  ranked as (
    select
      identity_id,
      row_number() over w as rank,
      lead(contact_score) over w as next_contact_score,
      lead(name_score) over w as next_name_score,
      contact_score,
      name_score
    from linkable
    window w as (order by contact_score desc, name_score desc, identity_id)
  )
  select identity_id into v_identity
  from ranked
  where rank = 1
    -- Link only when no other candidate is as strong.
    and (
      next_contact_score is null
      or (contact_score, name_score) > (next_contact_score, next_name_score)
    );

  if v_identity is null then
    insert into public."Identities" (user_id, first_name, last_name, is_client)
    values (v_owner, v_first, v_last, false)
    returning identity_id into v_identity;
  end if;

  -- Fill in missing details only; never change what the stylist has on file.
  -- (Older app versions saved a bare "+1" when there was no phone.)
  insert into public."IdentityContacts" as c (identity_id, phone, email)
  values (v_identity, v_phone, v_email)
  on conflict (identity_id) do update set
    phone = case
      when length(booking_private.phone_digits(c.phone)) < 7
        and excluded.phone is not null
        then excluded.phone
      else c.phone
    end,
    email = coalesce(nullif(btrim(c.email), ''), excluded.email)
  where (length(booking_private.phone_digits(c.phone)) < 7 and excluded.phone is not null)
    or (nullif(btrim(c.email), '') is null and excluded.email is not null);

  insert into public."IdentityPreferences"
    (identity_id, send_creation, send_cancellation, send_reminder, reminder_lead)
  values (v_identity, false, false, false, 0)
  on conflict (identity_id) do nothing;

  -- Recorded opt-outs stay until the requester opts in again; not opting in
  -- on this request is not an opt-out.
  insert into public."IdentitySMSConsent" as s
    (identity_id, consent_status, updated_at)
  values (v_identity, v_consent, case when v_consent then now() end)
  on conflict (identity_id) do update set
    consent_status = true,
    updated_at = now()
  where v_consent and s.consent_status is distinct from true;

  insert into public."Appointments" (
    identity_id,
    user_id,
    stylist_slug,
    is_online_booking,
    status,
    client_name,
    client_phone,
    client_email,
    services,
    appointment_date,
    appointment_start_time,
    appointment_end_time,
    notes,
    price
  )
  values (
    v_identity,
    v_owner,
    v_slug,
    true,
    'requested',
    v_first || ' ' || v_last,
    v_phone,
    v_email,
    p_request->>'services',
    (p_request->>'appointment_date')::date,
    (p_request->>'appointment_start_time')::time,
    (p_request->>'appointment_end_time')::time,
    nullif(btrim(p_request->>'notes'), ''),
    coalesce((p_request->>'price')::double precision, 0)
  )
  returning appointment_id into v_appointment;

  insert into booking_private.request_keys (request_key, appointment_id, fingerprint)
  values (p_request_key, v_appointment, v_fingerprint);

  return v_appointment;
end;
$$;

-- Only the booking site's server (service role) may call this: it would
-- otherwise let anyone write to a stylist's identities.
revoke all on function public.request_online_booking(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.request_online_booking(uuid, jsonb)
  to service_role;
