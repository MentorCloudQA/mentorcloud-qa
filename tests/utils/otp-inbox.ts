import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Read QA emails from the Google-hosted mailbox over IMAP.
 *
 * The OTP-login test user is a plus-alias (venu.ratcha+otp@mytemple.in) whose
 * mail lands in the base venu.ratcha@mytemple.in inbox. Configure in .env:
 *   OTP_IMAP_HOST=imap.gmail.com   (default)
 *   OTP_IMAP_USER=venu.ratcha@mytemple.in
 *   OTP_IMAP_PASSWORD=<16-char Google App Password — requires 2FA on the account>
 *
 * fetchEmail() filters strictly by recipient + since (+ optional subject/from)
 * so it only ever reads the MentorCloud test mail it triggered, never unrelated
 * inbox mail. Returns null when unconfigured or nothing arrives in time, so
 * callers can skip gracefully.
 */
export function otpInboxConfigured(): boolean {
  return Boolean(process.env.OTP_IMAP_USER && process.env.OTP_IMAP_PASSWORD);
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface FoundEmail {
  subject: string;
  from: string;
  text: string;
  html: string;
  /** Absolute URLs found in the message body (html hrefs + plain-text links). */
  links: string[];
  attachments: EmailAttachment[];
  date: Date | null;
}

/**
 * Poll the inbox for a message to `to` received at/after `since`, optionally
 * matching `subject` / `from`. Returns the newest match, or null on timeout.
 */
export async function fetchEmail(opts: {
  to: string;
  since: Date;
  subject?: RegExp;
  from?: RegExp;
  timeoutMs?: number;
}): Promise<FoundEmail | null> {
  if (!otpInboxConfigured()) return null;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    const found = await searchOnce(opts).catch(() => null);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return null;
}

/**
 * Fetch a 6-digit login OTP sent to `to` at/after `since`. Thin wrapper over
 * fetchEmail kept for TC-AUTH-004.
 */
export async function fetchOtpFromInbox(opts: {
  to: string;
  since: Date;
  timeoutMs?: number;
}): Promise<string | null> {
  const mail = await fetchEmail({
    to: opts.to,
    since: opts.since,
    timeoutMs: opts.timeoutMs,
  });
  if (!mail) return null;
  const m = `${mail.subject}\n${mail.text}`.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

async function searchOnce(opts: {
  to: string;
  since: Date;
  subject?: RegExp;
  from?: RegExp;
}): Promise<FoundEmail | null> {
  const client = new ImapFlow({
    host: process.env.OTP_IMAP_HOST ?? 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.OTP_IMAP_USER!, pass: process.env.OTP_IMAP_PASSWORD! },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP SINCE has day granularity; filter precisely on the parsed Date below.
      const uids = await client.search({ to: opts.to, since: opts.since });
      const newestFirst = (uids || []).sort((a, b) => b - a).slice(0, 12);
      for (const uid of newestFirst) {
        const msg = await client.fetchOne(uid, { source: true });
        if (!msg || !msg.source) continue;
        const mail = await simpleParser(msg.source);
        if (mail.date && mail.date.getTime() < opts.since.getTime() - 60_000) continue;
        const subject = mail.subject ?? '';
        const from = mail.from?.text ?? '';
        if (opts.subject && !opts.subject.test(subject)) continue;
        if (opts.from && !opts.from.test(from)) continue;
        const html = typeof mail.html === 'string' ? mail.html : '';
        const text = mail.text ?? '';
        const links = extractLinks(html, text);
        const attachments: EmailAttachment[] = (mail.attachments ?? []).map((a) => ({
          filename: a.filename ?? '',
          contentType: a.contentType ?? '',
          size: a.size ?? 0,
        }));
        return { subject, from, text, html, links, attachments, date: mail.date ?? null };
      }
      return null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function extractLinks(html: string, text: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) urls.add(m[1]);
  for (const m of text.matchAll(/https?:\/\/[^\s<>")]+/gi)) urls.add(m[0]);
  return [...urls];
}
