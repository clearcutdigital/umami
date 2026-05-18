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
