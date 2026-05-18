import { sendWebsiteMonthlyReport } from '@/lib/monthlyReport';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  try {
    const result = await sendWebsiteMonthlyReport(websiteId, new Date(), { requireEnabled: false });

    return json(result);
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }

    return Response.json(
      { error: { status: 400, code: 'bad-request', message: error.message } },
      { status: 400 },
    );
  }
}
