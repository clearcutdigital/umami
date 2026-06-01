import crypto from 'node:crypto';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { secret } from '@/lib/crypto';
import { formatDate } from '@/lib/date';
import { escapeHtml, sendEmailitEmail, validateRecipientList } from '@/lib/email';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import {
  getEnabledMonthlyReportRecipients,
  getEnabledWebsiteMonthlyReports,
  getWebsite,
  getWebsiteMonthlyReport,
  syncWebsiteMonthlyReportRecipients,
  updateWebsiteMonthlyReport,
} from '@/queries/prisma';
import { getPageviewMetrics, getSessionMetrics, getWebsiteStats } from '@/queries/sql';

const REPORT_TIMEZONE = 'America/New_York';
const REPORT_START_HOUR = 11;
const REPORT_START_MINUTE = 40;
const REPORT_SLOT_MINUTES = 10;

function getMonthlyReportUnsubscribeSecret() {
  return process.env.MONTHLY_REPORT_UNSUBSCRIBE_SECRET || secret();
}

function signMonthlyReportUnsubscribePayload(websiteId: string, email: string) {
  return crypto
    .createHmac('sha256', getMonthlyReportUnsubscribeSecret())
    .update(`${websiteId}:${email.trim().toLowerCase()}`)
    .digest('hex');
}

export function createMonthlyReportUnsubscribeToken(websiteId: string, email: string) {
  const payload = {
    websiteId,
    email: email.trim().toLowerCase(),
    signature: signMonthlyReportUnsubscribePayload(websiteId, email),
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function verifyMonthlyReportUnsubscribeToken(token: string) {
  const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
    websiteId?: string;
    email?: string;
    signature?: string;
  };

  if (!payload.websiteId || !payload.email || !payload.signature) {
    throw new Error('Invalid unsubscribe token.');
  }

  const expected = signMonthlyReportUnsubscribePayload(payload.websiteId, payload.email);

  if (payload.signature.length !== expected.length) {
    throw new Error('Invalid unsubscribe token.');
  }

  const valid = crypto.timingSafeEqual(Buffer.from(payload.signature), Buffer.from(expected));

  if (!valid) {
    throw new Error('Invalid unsubscribe token.');
  }

  return {
    websiteId: payload.websiteId,
    email: payload.email,
  };
}

function getUnsubscribeBaseUrl() {
  const value =
    process.env.MONTHLY_REPORT_UNSUBSCRIBE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL ||
    process.env.URL ||
    process.env.DEPLOY_URL ||
    process.env.VERCEL_URL;

  if (!value) {
    return null;
  }

  return value.startsWith('http') ? value : `https://${value}`;
}

function getMonthlyReportUnsubscribeUrl(websiteId: string, email: string) {
  const baseUrl = getUnsubscribeBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const url = new URL('/api/monthly-report/unsubscribe', baseUrl);
  url.searchParams.set('token', createMonthlyReportUnsubscribeToken(websiteId, email));

  return url.toString();
}

function renderUnsubscribeHtml(websiteId: string, email: string) {
  const unsubscribeUrl = getMonthlyReportUnsubscribeUrl(websiteId, email);

  if (!unsubscribeUrl) {
    return '';
  }

  return `
    <div style="padding:0 24px 28px; text-align:center; color:#64748b; font-size:12px; line-height:1.5;">
      You are receiving this monthly analytics report at ${escapeHtml(email)}.
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#2563eb; text-decoration:underline;">Unsubscribe</a>
    </div>
  `;
}

function renderUnsubscribeText(websiteId: string, email: string) {
  const unsubscribeUrl = getMonthlyReportUnsubscribeUrl(websiteId, email);

  if (!unsubscribeUrl) {
    return '';
  }

  return `\n\nUnsubscribe from this monthly analytics report: ${unsubscribeUrl}`;
}

function toNumber(value: number | bigint | null | undefined) {
  return typeof value === 'bigint' ? Number(value) : Number(value || 0);
}

function normalizeMetricRows(items: { x: string; y: number | bigint }[]) {
  return items.map(item => ({
    ...item,
    y: toNumber(item.y),
  }));
}

function summarizeSources(items: { x: string; y: number }[], limit = 9) {
  if (items.length <= limit) {
    return items;
  }

  const visible = items.slice(0, limit);
  const remaining = items.slice(limit);
  const moreCount = remaining.reduce((sum, item) => sum + item.y, 0);

  return [...visible, { x: 'More', y: moreCount }];
}

function getTimezoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
  };
}

function getMonthlyReportSchedule(referenceDate = new Date()) {
  const local = getTimezoneParts(referenceDate, REPORT_TIMEZONE);
  const startMinuteOfDay = REPORT_START_HOUR * 60 + REPORT_START_MINUTE;
  const currentMinuteOfDay = local.hour * 60 + local.minute;
  const minutesSinceStart =
    (local.day - 1) * 24 * 60 + currentMinuteOfDay - startMinuteOfDay;

  return {
    timeZone: REPORT_TIMEZONE,
    localDate: `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`,
    localTime: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    active: minutesSinceStart >= 0,
    slotIndex: minutesSinceStart >= 0 ? Math.floor(minutesSinceStart / REPORT_SLOT_MINUTES) : -1,
    slotMinutes: REPORT_SLOT_MINUTES,
    startHour: REPORT_START_HOUR,
    startMinute: REPORT_START_MINUTE,
  };
}

function getMonthlyDateRange(referenceDate = new Date()) {
  const reportMonth = subMonths(referenceDate, 1);

  return {
    startDate: startOfMonth(reportMonth),
    endDate: endOfMonth(reportMonth),
    label: formatDate(reportMonth, 'MMMM yyyy'),
  };
}

function renderList(items: { x: string; y: number }[]) {
  if (!items.length) {
    return '<li style="padding: 10px 0; color: #64748b;">No data</li>';
  }

  return items
    .map(
      ({ x, y }, index) => `
        <li style="display:flex; justify-content:space-between; gap:16px; padding:12px 0; border-top:${index === 0 ? '0' : '1px solid #e2e8f0'};">
          <span style="color:#0f172a;">${escapeHtml(x || 'Unknown')}</span>
          <strong style="color:#0f172a; font-weight:600; white-space:nowrap;">${formatLongNumber(y)}</strong>
        </li>
      `,
    )
    .join('');
}

function renderSourceList(items: { x: string; y: number }[], totalVisitors: number) {
  if (!items.length) {
    return '<li style="padding: 10px 0; color: #64748b;">No data</li>';
  }

  return items
    .map(
      ({ x, y }, index) => `
        <li style="padding:12px 0; border-top:${index === 0 ? '0' : '1px solid #e2e8f0'};">
          <div style="display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:12px; align-items:center;">
            <span style="color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(x || 'Direct')}</span>
            <strong style="color:#0f172a; font-weight:600; white-space:nowrap;">${formatLongNumber(y)}</strong>
            <span style="color:#64748b; white-space:nowrap;">${totalVisitors ? Math.round((y / totalVisitors) * 100) : 0}%</span>
          </div>
        </li>
      `,
    )
    .join('');
}

function renderTextList(items: { x: string; y: number }[]) {
  if (!items.length) {
    return '- No data';
  }

  return items.map(({ x, y }) => `- ${x || 'Direct'}: ${formatLongNumber(y)}`).join('\n');
}

function renderSourceTextList(items: { x: string; y: number }[], totalVisitors: number) {
  if (!items.length) {
    return '- No data';
  }

  return items
    .map(
      ({ x, y }) =>
        `- ${x || 'Direct'}: ${formatLongNumber(y)} (${totalVisitors ? Math.round((y / totalVisitors) * 100) : 0}%)`,
    )
    .join('\n');
}

export async function sendWebsiteMonthlyReport(
  websiteId: string,
  referenceDate = new Date(),
  options?: { requireEnabled?: boolean },
) {
  const [website, monthlyReport] = await Promise.all([
    getWebsite(websiteId),
    getWebsiteMonthlyReport(websiteId),
  ]);

  if (!website) {
    throw new Error('Website not found.');
  }

  if (!monthlyReport) {
    throw new Error('Save monthly report recipients before sending.');
  }

  if ((options?.requireEnabled ?? true) && !monthlyReport?.enabled) {
    throw new Error('Monthly reports are not enabled for this website.');
  }

  const recipients = validateRecipientList(monthlyReport.recipients);
  await syncWebsiteMonthlyReportRecipients(websiteId, recipients);
  const activeRecipients = await getEnabledMonthlyReportRecipients(websiteId, recipients);

  if (!activeRecipients.length) {
    throw new Error('No monthly report recipients are subscribed.');
  }
  const { startDate, endDate, label } = getMonthlyDateRange(referenceDate);
  const filters = { startDate, endDate };
  const usFilters = { ...filters, country: 'US' };

  const [stats, sources, pages, states, cities] = await Promise.all([
    getWebsiteStats(websiteId, filters),
    getPageviewMetrics(websiteId, { type: 'referrer', limit: 25 }, filters),
    getPageviewMetrics(websiteId, { type: 'path', limit: 5 }, filters),
    getSessionMetrics(websiteId, { type: 'region', limit: 5 }, usFilters),
    getSessionMetrics(websiteId, { type: 'city', limit: 5 }, usFilters),
  ]);
  const totals = stats
    ? {
        visitors: toNumber(stats.visitors),
        visits: toNumber(stats.visits),
        pageviews: toNumber(stats.pageviews),
        bounces: toNumber(stats.bounces),
        totaltime: toNumber(stats.totaltime),
      }
    : { visitors: 0, visits: 0, pageviews: 0, bounces: 0, totaltime: 0 };
  const topSources = summarizeSources(normalizeMetricRows(sources));
  const topPages = normalizeMetricRows(pages);
  const topStates = normalizeMetricRows(states);
  const topCities = normalizeMetricRows(cities);

  const visits = totals.visits || 0;
  const bounceRate = visits ? Math.round((Math.min(visits, totals.bounces) / visits) * 100) : 0;
  const visitDuration = visits
    ? formatShortTime(Math.abs(~~(totals.totaltime / visits)), ['m', 's'], ' ')
    : '0s';
  const subject = monthlyReport.subject?.trim() || `Monthly report for ${website.name} · ${label}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; background:#f8fafc; padding:32px 16px; color:#0f172a;">
      <div style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:20px; overflow:hidden; box-shadow:0 12px 30px rgba(15,23,42,0.08);">
        <div style="padding:32px; background:linear-gradient(135deg,#0f172a,#1d4ed8); color:#ffffff;">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; opacity:0.8;">Monthly Report</div>
          <h1 style="margin:12px 0 6px; font-size:30px; line-height:1.1;">${escapeHtml(website.name)}</h1>
          <p style="margin:0; color:rgba(255,255,255,0.8); font-size:15px;">Performance summary for ${escapeHtml(label)}</p>
        </div>
        <div style="padding:24px 24px 8px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:24px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px;"><div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em;">Visitors</div><div style="margin-top:8px; font-size:28px; font-weight:700;">${formatLongNumber(totals.visitors || 0)}</div></div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px;"><div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em;">Visits</div><div style="margin-top:8px; font-size:28px; font-weight:700;">${formatLongNumber(visits)}</div></div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px;"><div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em;">Pageviews</div><div style="margin-top:8px; font-size:28px; font-weight:700;">${formatLongNumber(totals.pageviews || 0)}</div></div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px;"><div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em;">Bounce Rate</div><div style="margin-top:8px; font-size:28px; font-weight:700;">${bounceRate}%</div></div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px;"><div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em;">Average Visit Duration</div><div style="margin-top:8px; font-size:28px; font-weight:700;">${visitDuration}</div></div>
          </div>

          <div style="margin-bottom:24px; border:1px solid #e2e8f0; border-radius:18px; padding:20px; background:#ffffff;">
            <h2 style="margin:0 0 4px; font-size:18px;">Sources</h2>
            <div style="display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:12px; padding:0 0 10px; color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #e2e8f0;">
              <span>Referrer</span>
              <span>Visitors</span>
              <span>Share</span>
            </div>
            <ul style="list-style:none; margin:0; padding:0;">${renderSourceList(topSources, totals.visitors)}</ul>
          </div>

          <div style="margin-bottom:24px; border:1px solid #e2e8f0; border-radius:18px; padding:20px; background:#ffffff;">
            <h2 style="margin:0 0 12px; font-size:18px;">Top Pages</h2>
            <ul style="list-style:none; margin:0; padding:0;">${renderList(topPages)}</ul>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:24px;">
            <div style="border:1px solid #e2e8f0; border-radius:18px; padding:20px; background:#ffffff;">
              <h2 style="margin:0 0 12px; font-size:18px;">Top US States</h2>
              <ul style="list-style:none; margin:0; padding:0;">${renderList(topStates)}</ul>
            </div>
            <div style="border:1px solid #e2e8f0; border-radius:18px; padding:20px; background:#ffffff;">
              <h2 style="margin:0 0 12px; font-size:18px;">Top US Cities</h2>
              <p style="margin:0 0 12px; color:#64748b; font-size:13px; line-height:1.5;">Based on IP-derived geolocation, so this is a general overview and won&apos;t be fully accurate.</p>
              <ul style="list-style:none; margin:0; padding:0;">${renderList(topCities)}</ul>
            </div>
          </div>
        </div>
        {{unsubscribeHtml}}
      </div>
    </div>
  `;

  const text = [
    `${website.name}`,
    `Monthly analytics report for ${label}`,
    '',
    `Visitors: ${formatLongNumber(totals.visitors || 0)}`,
    `Visits: ${formatLongNumber(visits)}`,
    `Pageviews: ${formatLongNumber(totals.pageviews || 0)}`,
    `Bounce rate: ${bounceRate}%`,
    `Average visit duration: ${visitDuration}`,
    '',
    'Sources',
    renderSourceTextList(topSources, totals.visitors),
    '',
    'Top pages',
    renderTextList(topPages),
    '',
    'Top US states',
    renderTextList(topStates),
    '',
    'Top US cities',
    'Based on IP-derived geolocation, so this is a general overview and will not be fully accurate.',
    renderTextList(topCities),
  ].join('\n');

  const results = [];

  for (const recipient of activeRecipients) {
    const result = await sendEmailitEmail({
      to: [recipient],
      subject,
      html: html.replace('{{unsubscribeHtml}}', renderUnsubscribeHtml(websiteId, recipient)),
      text: `${text}${renderUnsubscribeText(websiteId, recipient)}`,
      replyTo: monthlyReport.replyTo,
      meta: {
        type: 'monthly-report',
        websiteId,
        period: label,
      },
    });

    results.push({ recipient, result });
  }

  await updateWebsiteMonthlyReport(websiteId, { lastSentAt: new Date() });

  return { count: results.length, results };
}

export async function sendDueMonthlyReports(referenceDate = new Date()) {
  const reports = await getEnabledWebsiteMonthlyReports();
  const currentMonthStart = startOfMonth(referenceDate);
  const schedule = getMonthlyReportSchedule(referenceDate);
  const sent = [];
  const failed = [];

  if (!schedule.active) {
    return {
      sent,
      failed,
      skipped: [],
      schedule,
    };
  }

  const orderedReports = [...reports].sort((a, b) => a.websiteId.localeCompare(b.websiteId));
  const dueReports = orderedReports.filter((_report, index) => index <= schedule.slotIndex);
  const skipped = orderedReports
    .filter((_report, index) => index > schedule.slotIndex)
    .map((report, index) => ({
      websiteId: report.websiteId,
      websiteName: report.website.name,
      slot: dueReports.length + index,
      reason: 'scheduled-later',
    }));

  for (const [index, report] of dueReports.entries()) {
    if (report.lastSentAt && report.lastSentAt >= currentMonthStart) {
      skipped.push({
        websiteId: report.websiteId,
        websiteName: report.website.name,
        slot: index,
        reason: 'already-sent',
      });
      continue;
    }

    try {
      const result = await sendWebsiteMonthlyReport(report.websiteId, referenceDate);

      sent.push({
        websiteId: report.websiteId,
        websiteName: report.website.name,
        slot: index,
        emailCount: result.count,
      });
    } catch (error: any) {
      failed.push({
        websiteId: report.websiteId,
        websiteName: report.website.name,
        slot: index,
        message: error.message,
      });
    }
  }

  return { sent, failed, skipped, schedule };
}
