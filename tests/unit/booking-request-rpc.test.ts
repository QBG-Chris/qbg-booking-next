import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

// Runs the real migration against a copy of the deployed identity schema.
const schema = readFileSync(new URL("../fixtures/identity-schema.sql", import.meta.url), "utf8");
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261118120000_online_booking_identities.sql",
    import.meta.url,
  ),
  "utf8",
);

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const optedOutAt = "2026-01-01 00:00:00+00";

type Request = {
  stylist_slug: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  sms_consent: boolean;
  services: string;
  appointment_date: string;
  appointment_start_time: string;
  appointment_end_time: string;
  notes: string | null;
  price: number;
};
const request = (overrides: Partial<Request> = {}): Request => ({
  stylist_slug: "jane-doe",
  first_name: "Alex",
  last_name: "Smith",
  phone: "+15551234567",
  email: "alex@example.com",
  sms_consent: true,
  services: "Signature haircut",
  appointment_date: "2099-10-20",
  appointment_start_time: "10:30",
  appointment_end_time: "11:30",
  notes: null,
  price: 85,
  ...overrides,
});

let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(schema);
  await pg.exec(`begin;${migration}commit;`);
  await pg.exec(`
    insert into auth.users(id) values ('${owner}'), ('${other}');
    insert into public."BookingProfiles"(slug, user_id, is_enabled)
      values ('jane-doe', '${owner}', true), ('sam-lee', '${other}', true);
    insert into booking_push.devices(user_id) values ('${owner}');
  `);
});

/** Runs [body] as a PostgREST role; the booking site's server uses service_role. */
async function as<T>(role: "anon" | "authenticated" | "service_role", body: () => Promise<T>) {
  await pg.exec(`set session authorization authenticator; set role ${role}`);
  if (role === "authenticated")
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  try {
    return await body();
  } finally {
    await pg.exec("reset role; set session authorization postgres; reset request.jwt.claim.sub");
  }
}

async function call(body: Request | Record<string, unknown>, key: string) {
  const { rows } = await pg.query<{ id: number }>(
    "select public.request_online_booking($1::uuid, $2::jsonb) as id",
    [key, JSON.stringify(body)],
  );
  return rows[0].id;
}

function book(body: Request | Record<string, unknown> = request(), key = randomUUID()) {
  return as("service_role", () => call(body, key));
}

async function one<T>(sql: string, params: unknown[] = []) {
  const { rows } = await pg.query<T>(sql, params);
  return rows[0];
}

async function counts() {
  return one<Record<string, number>>(`
    select
      (select count(*)::int from public."Identities") as identities,
      (select count(*)::int from public."IdentityContacts") as contacts,
      (select count(*)::int from public."IdentityPreferences") as preferences,
      (select count(*)::int from public."IdentitySMSConsent") as consents,
      (select count(*)::int from public."Appointments") as appointments,
      (select count(*)::int from booking_private.request_keys) as request_keys
  `);
}

type IdentityRecord = {
  identity_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  is_client: boolean;
  phone: string | null;
  email: string | null;
  send_creation: boolean;
  send_cancellation: boolean;
  send_reminder: boolean;
  reminder_lead: number;
  consent_status: boolean;
  consent_updated_at: Date | null;
};
async function identity(identityId: string) {
  return one<IdentityRecord>(
    `select i.identity_id, i.user_id, i.first_name, i.last_name, i.is_client,
       c.phone, c.email,
       p.send_creation, p.send_cancellation, p.send_reminder, p.reminder_lead::int,
       s.consent_status, s.updated_at as consent_updated_at
     from public."Identities" i
     left join public."IdentityContacts" c using (identity_id)
     left join public."IdentityPreferences" p using (identity_id)
     left join public."IdentitySMSConsent" s using (identity_id)
     where i.identity_id = $1`,
    [identityId],
  );
}

async function appointment(id: number) {
  return one<Record<string, unknown>>(
    `select identity_id, user_id, stylist_slug, is_online_booking, status, client_name,
       client_phone, client_email, services, appointment_date::text,
       appointment_start_time::text, appointment_end_time::text, notes, price
     from public."Appointments" where appointment_id = $1`,
    [id],
  );
}

/** An identity the stylist already has, with all four rows unless told otherwise. */
async function existing({
  user = owner,
  first = "Alex",
  last = "Smith",
  phone = "+15551234567" as string | null,
  email = null as string | null,
  isClient = true,
  consent = true as boolean | null,
  preferences = true,
} = {}) {
  const { identity_id } = await one<{ identity_id: string }>(
    `insert into public."Identities"(user_id, first_name, last_name, is_client)
     values ($1, $2, $3, $4) returning identity_id`,
    [user, first, last, isClient],
  );
  await pg.query(
    `insert into public."IdentityContacts"(identity_id, phone, email) values ($1, $2, $3)`,
    [identity_id, phone, email],
  );
  if (preferences)
    await pg.query(
      `insert into public."IdentityPreferences"
         (identity_id, send_creation, send_cancellation, send_reminder, reminder_lead)
       values ($1, true, false, true, 2)`,
      [identity_id],
    );
  if (consent !== null)
    await pg.query(
      `insert into public."IdentitySMSConsent"(identity_id, consent_status, updated_at)
       values ($1, $2, $3)`,
      [identity_id, consent, optedOutAt],
    );
  return identity_id;
}

const linkedIdentity = async (id: number) => (await appointment(id)).identity_id as string;

describe("new requesters", () => {
  it("get all four identity records, as a non-client, and a linked appointment", async () => {
    const id = await book(request({ notes: "  A little shorter. " }));
    const identityId = await linkedIdentity(id);
    expect(await identity(identityId)).toMatchObject({
      user_id: owner,
      first_name: "Alex",
      last_name: "Smith",
      is_client: false,
      phone: "+15551234567",
      email: "alex@example.com",
      send_creation: false,
      send_cancellation: false,
      send_reminder: false,
      reminder_lead: 0,
      consent_status: true,
    });
    expect((await identity(identityId)).consent_updated_at).toBeInstanceOf(Date);
    expect(await appointment(id)).toEqual({
      identity_id: identityId,
      user_id: owner,
      stylist_slug: "jane-doe",
      is_online_booking: true,
      status: "requested",
      client_name: "Alex Smith",
      client_phone: "+15551234567",
      client_email: "alex@example.com",
      services: "Signature haircut",
      appointment_date: "2099-10-20",
      appointment_start_time: "10:30:00",
      appointment_end_time: "11:30:00",
      notes: "A little shorter.",
      price: 85,
    });
    expect(await counts()).toMatchObject({
      identities: 1,
      contacts: 1,
      preferences: 1,
      consents: 1,
      appointments: 1,
    });
  });

  it("queues the stylist's push notification but no client texts", async () => {
    const id = await book();
    expect(
      await one(
        `select count(*)::int as n from booking_push.deliveries where appointment_id = $1`,
        [id],
      ),
    ).toEqual({ n: 1 });
    expect(await one(`select count(*)::int as n from public."ReminderJobs"`)).toEqual({ n: 0 });
  });

  it("are visible to the owning stylist through row level security, and only to them", async () => {
    const id = await book();
    const identityId = await linkedIdentity(id);
    const rows = await as(
      "authenticated",
      async () =>
        (
          await pg.query(
            `select i.identity_id, c.phone, s.consent_status from public."Identities" i
           join public."IdentityContacts" c using (identity_id)
           join public."IdentitySMSConsent" s using (identity_id)`,
          )
        ).rows,
    );
    expect(rows).toEqual([
      { identity_id: identityId, phone: "+15551234567", consent_status: true },
    ]);
    await book(request({ stylist_slug: "sam-lee" }));
    expect(
      await as(
        "authenticated",
        async () => (await pg.query(`select identity_id from public."Identities"`)).rows,
      ),
    ).toEqual([{ identity_id: identityId }]);
  });
});

describe("returning requesters", () => {
  it("reuse an existing client without duplicates, resetting preferences, or changing is_client", async () => {
    const clientId = await existing({ phone: "(555) 123-4567" });
    const before = await identity(clientId);
    const first = await book(request({ first_name: " alex ", last_name: "SMITH" }));
    const second = await book();
    expect(await linkedIdentity(first)).toBe(clientId);
    expect(await linkedIdentity(second)).toBe(clientId);
    expect(await identity(clientId)).toEqual({
      ...before,
      // Missing contact details are filled in; nothing on file changes.
      email: "alex@example.com",
    });
    expect(await counts()).toMatchObject({
      identities: 1,
      contacts: 1,
      preferences: 1,
      consents: 1,
    });
  });

  it("stay non-clients across requests until the app approves one", async () => {
    const first = await book();
    const identityId = await linkedIdentity(first);
    await book(request({ appointment_start_time: "13:00", appointment_end_time: "14:00" }));
    expect((await identity(identityId)).is_client).toBe(false);
    // The app marks the identity as a client on approval.
    await pg.query(`update public."Identities" set is_client = true where identity_id = $1`, [
      identityId,
    ]);
    const third = await book(request({ appointment_date: "2099-10-21" }));
    expect(await linkedIdentity(third)).toBe(identityId);
    expect((await identity(identityId)).is_client).toBe(true);
    expect(await counts()).toMatchObject({ identities: 1, appointments: 3 });
  });

  it("match a name joined differently and fill in a legacy bare +1 phone", async () => {
    const clientId = await existing({
      first: "Mary Ann",
      last: "O'Neil",
      phone: "+1",
      email: "MARY@example.com",
    });
    const id = await book(
      request({ first_name: "Mary", last_name: "Ann ONeil", email: "mary@example.com " }),
    );
    expect(await linkedIdentity(id)).toBe(clientId);
    expect(await identity(clientId)).toMatchObject({
      first_name: "Mary Ann",
      phone: "+15551234567",
      email: "MARY@example.com",
    });
  });

  it("get any missing accompanying rows, with defaults", async () => {
    const clientId = await existing({ consent: null, preferences: false });
    await book(request({ sms_consent: false }));
    expect(await identity(clientId)).toMatchObject({
      send_creation: false,
      send_cancellation: false,
      send_reminder: false,
      reminder_lead: 0,
      consent_status: false,
      consent_updated_at: null,
    });
  });

  it("link to the strongest match when only one is that strong", async () => {
    await existing();
    const withEmail = await existing({ email: "alex@example.com" });
    expect(await linkedIdentity(await book())).toBe(withEmail);
  });
});

describe("SMS consent", () => {
  it("is not recorded for a requester who didn't opt in", async () => {
    const id = await book(request({ sms_consent: false }));
    expect(await identity(await linkedIdentity(id))).toMatchObject({
      consent_status: false,
      consent_updated_at: null,
    });
  });

  it("keeps a recorded opt-out until the requester explicitly opts in again", async () => {
    const clientId = await existing({ consent: false });
    await book(request({ sms_consent: false }));
    expect(await identity(clientId)).toMatchObject({
      consent_status: false,
      consent_updated_at: new Date(optedOutAt),
    });
    await book(request({ appointment_date: "2099-10-21" }));
    const optedIn = await identity(clientId);
    expect(optedIn.consent_status).toBe(true);
    expect(optedIn.consent_updated_at!.getTime()).toBeGreaterThan(new Date(optedOutAt).getTime());
  });

  it("isn't revoked when a later request doesn't opt in, and only changes on a change", async () => {
    const clientId = await existing({ consent: true });
    await book(request({ sms_consent: false }));
    await book(request({ appointment_date: "2099-10-21" }));
    expect(await identity(clientId)).toMatchObject({
      consent_status: true,
      consent_updated_at: new Date(optedOutAt),
    });
  });

  it("is never recorded without a phone number, and a missing phone doesn't match or erase one", async () => {
    const id = await book(request({ phone: null, email: "new@example.com", first_name: "Pat" }));
    expect(await identity(await linkedIdentity(id))).toMatchObject({
      phone: null,
      consent_status: false,
      consent_updated_at: null,
    });
    expect((await appointment(id)).client_phone).toBeNull();

    const clientId = await existing({ email: "alex@example.com", consent: false });
    const linked = await book(request({ phone: null }));
    expect(await linkedIdentity(linked)).toBe(clientId);
    expect(await identity(clientId)).toMatchObject({
      phone: "+15551234567",
      consent_status: false,
    });
  });
});

describe("identity matching never links the wrong person", () => {
  it("keeps identities within the booking's stylist", async () => {
    const otherClient = await existing({ user: other, email: "alex@example.com" });
    const before = await identity(otherClient);
    const id = await book();
    const identityId = await linkedIdentity(id);
    expect(identityId).not.toBe(otherClient);
    expect((await identity(identityId)).user_id).toBe(owner);
    expect(await identity(otherClient)).toEqual(before);
    // The other stylist's own booking page does link their client.
    const theirs = await book(request({ stylist_slug: "sam-lee" }));
    expect(await appointment(theirs)).toMatchObject({ identity_id: otherClient, user_id: other });
    expect(
      await one(`select count(*)::int as n from public."Appointments" a
        join public."Identities" i using (identity_id) where i.user_id <> a.user_id`),
    ).toEqual({ n: 0 });
  });

  it("creates a new identity for someone sharing a phone under a different name", async () => {
    const parent = await existing({ first: "Sam", consent: false });
    const before = await identity(parent);
    const id = await book();
    expect(await linkedIdentity(id)).not.toBe(parent);
    expect(await identity(parent)).toEqual(before);
  });

  it("creates a new identity when two people match equally", async () => {
    const a = await existing();
    const b = await existing();
    const identityId = await linkedIdentity(await book());
    expect([a, b]).not.toContain(identityId);
  });

  it("does not match by name alone", async () => {
    const namesake = await existing({ phone: "+15550001111", email: "other@example.com" });
    expect(await linkedIdentity(await book())).not.toBe(namesake);
  });

  it("does not link an email match whose phone on file differs, or overwrite that phone", async () => {
    const clientId = await existing({ phone: "+15550001111", email: "alex@example.com" });
    expect(await linkedIdentity(await book())).not.toBe(clientId);
    expect((await identity(clientId)).phone).toBe("+15550001111");
  });

  it("does not link a compatible name on a phone match alone", async () => {
    const phoneOnly = await existing({ first: "Alexander" });
    expect(await linkedIdentity(await book())).not.toBe(phoneOnly);
  });

  it("links a compatible name when both phone and email match", async () => {
    const both = await existing({ first: "Alexander", email: "alex@example.com" });
    expect(await linkedIdentity(await book())).toBe(both);
  });
});

describe("retries and failures", () => {
  it("return the saved appointment for a retried request without writing again", async () => {
    const key = randomUUID();
    const id = await book(request(), key);
    const after = await counts();
    expect(await book(request(), key)).toBe(id);
    expect(await counts()).toEqual(after);
    expect(after).toMatchObject({ identities: 1, appointments: 1, request_keys: 1 });
  });

  it("refuse a request key reused for a different booking", async () => {
    const key = randomUUID();
    await book(request(), key);
    const after = await counts();
    await expect(book(request({ appointment_start_time: "14:00" }), key)).rejects.toMatchObject({
      code: "PT409",
    });
    expect(await counts()).toEqual(after);
  });

  it("leave nothing behind when the appointment can't be saved, so a retry succeeds", async () => {
    await existing({ phone: "+15550001111" });
    const before = await counts();
    const key = randomUUID();
    await expect(book(request({ appointment_start_time: "25:00" }), key)).rejects.toThrow();
    expect(await counts()).toEqual(before);
    const id = await book(request(), key);
    expect(await counts()).toMatchObject({
      identities: before.identities + 1,
      appointments: 1,
      request_keys: 1,
    });
    expect(await book(request(), key)).toBe(id);
  });

  it("roll back the identity when a later write fails", async () => {
    await pg.exec(`
      create function public.fail_booking() returns trigger language plpgsql as $$
      begin raise exception 'simulated failure'; end $$;
      create trigger fail_booking before insert on public."Appointments"
        for each row execute function public.fail_booking();
    `);
    await expect(book()).rejects.toThrow("simulated failure");
    expect(await counts()).toMatchObject({
      identities: 0,
      contacts: 0,
      preferences: 0,
      consents: 0,
      appointments: 0,
      request_keys: 0,
    });
  });

  it.each([
    [{ stylist_slug: "nobody" }, "PT404"],
    [{ phone: "5551234567" }, "22023"],
    [{ first_name: "  " }, "22023"],
    [{ email: "not-an-email" }, "22023"],
    [{ sms_consent: "yes" }, "22023"],
  ])("reject %j without writing", async (overrides, code) => {
    const before = await counts();
    await expect(book({ ...request(), ...overrides })).rejects.toMatchObject({ code });
    expect(await counts()).toEqual(before);
  });
});

describe("access", () => {
  it.each(["anon", "authenticated"] as const)(
    "%s callers can't save requests or read request keys",
    async (role) => {
      await book();
      await expect(as(role, () => call(request(), randomUUID()))).rejects.toThrow(
        /permission denied for function/,
      );
      await expect(
        as(role, () => pg.query("select * from booking_private.request_keys")),
      ).rejects.toThrow(/permission denied/);
      expect(await counts()).toMatchObject({ identities: 1, appointments: 1 });
    },
  );
});

describe("writes", () => {
  it("leave a reused identity's complete contact row untouched", async () => {
    const clientId = await existing({ email: "alex@example.com" });
    const { xmin } = await one<{ xmin: string }>(
      `select xmin::text from public."IdentityContacts" where identity_id = $1`,
      [clientId],
    );
    expect(await linkedIdentity(await book())).toBe(clientId);
    expect(
      await one(`select xmin::text from public."IdentityContacts" where identity_id = $1`, [
        clientId,
      ]),
    ).toEqual({ xmin });
  });
});
