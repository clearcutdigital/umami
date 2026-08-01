import { verifyMonthlyReportUnsubscribeToken } from '@/lib/monthlyReport';
import { badRequest } from '@/lib/response';
import { unsubscribeMonthlyReportRecipient } from '@/queries/prisma';

function html(message: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Monthly report unsubscribe</title></head><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:40px 16px;"><main style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 12px 30px rgba(15,23,42,.08);"><h1 style="font-size:24px;margin:0 0 12px;">Monthly report unsubscribe</h1><p style="font-size:16px;line-height:1.5;margin:0;color:#334155;">${message}</p></main></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');

  if (!token) {
    return badRequest({ message: 'Missing unsubscribe token.' });
  }

  try {
    const { websiteId, email } = verifyMonthlyReportUnsubscribeToken(token);

    await unsubscribeMonthlyReportRecipient(websiteId, email);

    return html('You have been unsubscribed from this monthly analytics report.');
  } catch {
    return badRequest({ message: 'Invalid unsubscribe token.' });
  }
}
