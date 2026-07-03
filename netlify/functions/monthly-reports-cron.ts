export const config = {
  schedule: '0,30 12-23 1-3 * *',
};

export default async function handler() {
  const secret = process.env.EMAIL_REPORTS_CRON_SECRET;
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;

  if (!secret) {
    return Response.json(
      { error: 'EMAIL_REPORTS_CRON_SECRET is not configured.' },
      { status: 500 },
    );
  }

  if (!siteUrl) {
    return Response.json({ error: 'Netlify site URL is not available.' }, { status: 500 });
  }

  const response = await fetch(new URL('/api/cron/monthly-reports', siteUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  const body = await response.text();

  console.log('monthly-reports-cron', {
    status: response.status,
    body,
  });

  return new Response(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json',
    },
  });
}
