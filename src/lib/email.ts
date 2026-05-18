import { z } from 'zod';
import { getEmailSettings } from '@/queries/prisma';

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) {
    return fallback;
  }

  return value === 'true';
}

const emailSchema = z.string().email();

export function parseRecipientList(input: string) {
  const recipients = input
    .split(/[\n,;]/)
    .map(value => value.trim())
    .filter(Boolean);

  return Array.from(new Set(recipients));
}

export function validateRecipientList(input: string) {
  const recipients = parseRecipientList(input);

  if (!recipients.length) {
    throw new Error('At least one recipient is required.');
  }

  for (const email of recipients) {
    const result = emailSchema.safeParse(email);

    if (!result.success) {
      throw new Error(`Invalid recipient email: ${email}`);
    }
  }

  return recipients;
}

export async function sendEmailitEmail(data: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  meta?: Record<string, string>;
}) {
  const settings = await getEmailSettings();
  const apiKey = process.env.EMAILIT_API_KEY || settings?.apiKey;
  const fromAddress = process.env.EMAILIT_FROM || settings?.fromAddress;
  const defaultReplyTo = process.env.EMAILIT_REPLY_TO || settings?.replyTo;
  const trackingLoads = parseBoolean(
    process.env.EMAILIT_TRACKING_LOADS,
    settings?.trackingLoads ?? false,
  );
  const trackingClicks = parseBoolean(
    process.env.EMAILIT_TRACKING_CLICKS,
    settings?.trackingClicks ?? false,
  );
  const tracking =
    trackingLoads || trackingClicks ? { loads: trackingLoads, clicks: trackingClicks } : false;

  if (!apiKey || !fromAddress) {
    throw new Error('Email delivery is not configured.');
  }

  const response = await fetch('https://api.emailit.com/v2/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      reply_to: data.replyTo || defaultReplyTo || undefined,
      meta: data.meta,
      tracking,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || result?.message || result?.details || 'Email delivery failed.',
    );
  }

  return result;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
