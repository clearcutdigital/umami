import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, forbidden, json } from '@/lib/response';
import { getEmailSettings, upsertEmailSettings } from '@/queries/prisma';

const EMAILIT_FROM_ADDRESS = 'analytics@forms.clearcutdigital.com';

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  if (!auth.user.isAdmin) {
    return forbidden();
  }

  const settings = await getEmailSettings();
  const envApiKey = process.env.EMAILIT_API_KEY;

  return json({
    apiKey: envApiKey ? '' : settings?.apiKey || '',
    apiKeyConfigured: !!(envApiKey || settings?.apiKey),
    apiKeyFromEnv: !!envApiKey,
    fromAddress: EMAILIT_FROM_ADDRESS,
    fromAddressFromEnv: true,
    replyTo: settings?.replyTo || '',
    trackingLoads: settings?.trackingLoads ?? true,
    trackingClicks: settings?.trackingClicks ?? true,
  });
}

export async function POST(request: Request) {
  const schema = z.object({
    apiKey: z.string().trim().optional().or(z.literal('')),
    fromAddress: z.string().trim().optional().or(z.literal('')),
    replyTo: z.string().trim().optional().or(z.literal('')),
    trackingLoads: z.boolean().default(true),
    trackingClicks: z.boolean().default(true),
  });
  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!auth.user.isAdmin) {
    return forbidden();
  }

  const settings = await getEmailSettings();
  const envApiKey = process.env.EMAILIT_API_KEY;
  const apiKey = envApiKey ? settings?.apiKey || '[ENV]' : body.apiKey || settings?.apiKey;
  const fromAddress = EMAILIT_FROM_ADDRESS;

  if (!apiKey) {
    return badRequest({ message: 'API key is required.' });
  }

  const result = await upsertEmailSettings({
    apiKey,
    fromAddress,
    replyTo: body.replyTo || null,
    trackingLoads: body.trackingLoads,
    trackingClicks: body.trackingClicks,
  });

  return json(result);
}
