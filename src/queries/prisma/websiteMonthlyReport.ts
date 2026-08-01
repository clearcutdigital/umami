import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

export function getWebsiteMonthlyReport(websiteId: string) {
  return prisma.client.websiteMonthlyReport.findUnique({
    where: {
      websiteId,
    },
  });
}

export function getEnabledWebsiteMonthlyReports() {
  return prisma.client.websiteMonthlyReport.findMany({
    where: {
      enabled: true,
      website: {
        deletedAt: null,
      },
    },
    include: {
      website: true,
    },
  });
}

export function upsertWebsiteMonthlyReport(
  websiteId: string,
  data: {
    enabled: boolean;
    recipients: string;
    subject?: string | null;
    replyTo?: string | null;
  },
) {
  return prisma.client.websiteMonthlyReport.upsert({
    where: {
      websiteId,
    },
    create: {
      websiteId,
      ...data,
    },
    update: data,
  });
}

export function updateWebsiteMonthlyReport(websiteId: string, data: Record<string, any>) {
  return prisma.client.websiteMonthlyReport.update({
    where: {
      websiteId,
    },
    data,
  });
}

function normalizeRecipientEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseRecipientList(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,;]/)
        .map(value => value.trim())
        .filter(Boolean),
    ),
  );
}

export async function syncWebsiteMonthlyReportRecipients(websiteId: string, recipients: string[]) {
  const emails = Array.from(new Set(recipients.map(normalizeRecipientEmail).filter(Boolean)));

  for (const email of emails) {
    await prisma.client.$executeRaw(Prisma.sql`
      insert into website_monthly_report_recipient (website_id, email)
      values (${websiteId}::uuid, ${email})
      on conflict (website_id, email) do nothing
    `);
  }

  if (emails.length) {
    await prisma.client.$executeRaw(Prisma.sql`
      delete from website_monthly_report_recipient
      where website_id = ${websiteId}::uuid
        and email not in (${Prisma.join(emails)})
    `);
  } else {
    await prisma.client.$executeRaw(Prisma.sql`
      delete from website_monthly_report_recipient
      where website_id = ${websiteId}::uuid
    `);
  }
}

export async function getEnabledMonthlyReportRecipients(websiteId: string, recipients: string[]) {
  const rows = await prisma.client.$queryRaw<{ email: string }[]>(Prisma.sql`
    select email
    from website_monthly_report_recipient
    where website_id = ${websiteId}::uuid
      and send = true
  `);
  const enabledEmails = new Set(rows.map(row => normalizeRecipientEmail(row.email)));

  return recipients.filter(email => enabledEmails.has(normalizeRecipientEmail(email)));
}

export async function unsubscribeMonthlyReportRecipient(websiteId: string, email: string) {
  const normalizedEmail = normalizeRecipientEmail(email);
  const report = await prisma.client.websiteMonthlyReport.findUnique({
    where: { websiteId },
    select: { recipients: true },
  });
  const remainingRecipients = report
    ? parseRecipientList(report.recipients).filter(
        recipient => normalizeRecipientEmail(recipient) !== normalizedEmail,
      )
    : [];

  await prisma.client.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`
      delete from website_monthly_report_recipient
      where website_id = ${websiteId}::uuid
        and email = ${normalizedEmail}
    `);

    if (report) {
      await tx.websiteMonthlyReport.update({
        where: { websiteId },
        data: {
          recipients: remainingRecipients.join('\n'),
          enabled: remainingRecipients.length > 0,
        },
      });
    }
  });
}
