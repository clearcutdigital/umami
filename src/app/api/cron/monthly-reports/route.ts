import { sendDueMonthlyReports } from '@/lib/monthlyReport';
import { forbidden, json } from '@/lib/response';

export async function POST(request: Request) {
  const secret = process.env.EMAIL_REPORTS_CRON_SECRET;
  const token = request.headers.get('authorization')?.split(' ')[1];

  if (!secret || token !== secret) {
    return forbidden();
  }

  const result = await sendDueMonthlyReports();

  return json(result);
}
