import { z } from 'zod';
import { validateRecipientList } from '@/lib/email';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import { getWebsiteMonthlyReport, upsertWebsiteMonthlyReport } from '@/queries/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const report = await getWebsiteMonthlyReport(websiteId);

  return json({
    enabled: report?.enabled ?? false,
    recipients: report?.recipients || '',
    lastSentAt: report?.lastSentAt || null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    enabled: z.boolean().default(false),
    recipients: z.string().default(''),
  });
  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  try {
    if (body.enabled) {
      validateRecipientList(body.recipients);
    }
  } catch (error: any) {
    return badRequest({ message: error.message });
  }

  const result = await upsertWebsiteMonthlyReport(websiteId, {
    enabled: body.enabled,
    recipients: body.recipients,
  });

  return json(result);
}
