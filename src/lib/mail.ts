// Sending mail.
//
// Form submissions have always been stored and never delivered: the inbox in
// the admin was the only way to learn that somebody had written in, which means
// finding out whenever you next happen to look. This is the transport that
// closes that gap.
//
// Credentials come from the environment, never from `site_settings`. That table
// is read on every render, handed to the Customizer, and returned whole by the
// settings API — it is the wrong place for a password on all three counts, and
// no amount of filtering makes it the right one.

import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  /** Set when the recipient should be able to hit Reply and reach a human. */
  replyTo?: string;
}

/** What the environment has to say, normalised. */
function env() {
  return {
    host: (process.env.SMTP_HOST ?? "").trim(),
    port: parseInt(process.env.SMTP_PORT ?? "587", 10) || 587,
    user: (process.env.SMTP_USER ?? "").trim(),
    pass: process.env.SMTP_PASS ?? "",
    from: (process.env.MAIL_FROM ?? "").trim(),
  };
}

/**
 * Whether mail can be sent at all.
 *
 * Exported so the admin can *say* that notifications are switched on but not
 * configured, rather than silently never sending — a setting that looks active
 * and does nothing is the failure this codebase keeps finding.
 */
export function mailConfigured(): boolean {
  const e = env();
  return !!(e.host && e.from);
}

/** A short description of the current configuration, for the admin screen. */
export function mailStatus(): { configured: boolean; detail: string } {
  const e = env();
  if (!e.host) return { configured: false, detail: "SMTP_HOST is not set." };
  if (!e.from) return { configured: false, detail: "MAIL_FROM is not set." };
  const auth = e.user ? `as ${e.user}` : "with no authentication";
  return { configured: true, detail: `${e.host}:${e.port} ${auth}, from ${e.from}` };
}

let cached: Transporter | null = null;
let cachedKey = "";

/**
 * The transport, rebuilt only when the environment changes.
 *
 * Nodemailer pools connections, so holding one across requests is the point;
 * keying on the config means a changed variable is picked up on the next send
 * rather than needing a restart.
 */
function transport(): Transporter | null {
  const e = env();
  if (!e.host || !e.from) return null;

  const key = JSON.stringify([e.host, e.port, e.user, e.pass]);
  if (cached && key === cachedKey) return cached;

  cached = nodemailer.createTransport({
    host: e.host,
    port: e.port,
    // 465 is implicit TLS; everything else starts plain and upgrades. Getting
    // this wrong is the single most common reason SMTP "just hangs".
    secure: e.port === 465,
    ...(e.user ? { auth: { user: e.user, pass: e.pass } } : {}),
  });
  cachedKey = key;
  return cached;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Sends one message.
 *
 * Never throws. Every caller is on a path where the user's real work has
 * already succeeded — the submission is stored, the comment is saved — and
 * failing that because a mail server was unreachable would be the wrong answer
 * to the wrong question.
 */
export async function sendMail(msg: MailMessage): Promise<SendResult> {
  const t = transport();
  if (!t) return { ok: false, error: "Mail is not configured." };

  const to = Array.isArray(msg.to) ? msg.to.filter(Boolean).join(", ") : msg.to;
  if (!to.trim()) return { ok: false, error: "No recipient." };

  try {
    await t.sendMail({
      from: env().from,
      to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

/** Splits a recipient setting — comma or newline separated — into addresses. */
export function recipientList(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/**
 * Fills `{{name}}` placeholders in a subject or body.
 *
 * Deliberately not a template engine: these strings are written by an
 * administrator and rendered into a plain-text email, so substitution is all
 * that is needed and anything more would be a way to get code into a send path.
 */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return String(tpl ?? "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) =>
    vars[k.toLowerCase()] ?? ""
  );
}
