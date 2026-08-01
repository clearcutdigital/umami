import prisma from '@/lib/prisma';

const EMAIL_SETTINGS_ID = 'default';

export function getEmailSettings() {
  return prisma.client.emailSettings.findUnique({
    where: {
      id: EMAIL_SETTINGS_ID,
    },
  });
}

export function upsertEmailSettings(data: {
  apiKey: string;
  fromAddress: string;
  replyTo?: string | null;
  trackingLoads: boolean;
  trackingClicks: boolean;
}) {
  return prisma.client.emailSettings.upsert({
    where: {
      id: EMAIL_SETTINGS_ID,
    },
    create: {
      id: EMAIL_SETTINGS_ID,
      ...data,
    },
    update: data,
  });
}
