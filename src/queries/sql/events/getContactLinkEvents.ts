import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getContactLinkEvents';
export const PHONE_LINK_CLICK_EVENT = 'Phone Link Click';
export const EMAIL_LINK_CLICK_EVENT = 'Email Link Click';

export interface ContactLinkEvent {
  id: string;
  createdAt: Date;
  clickedAt?: Date;
  eventName: string;
  contactType?: string;
  contactValue?: string;
  linkText?: string;
  linkHref?: string;
  urlPath?: string;
}

export async function getContactLinkEvents(
  ...args: [websiteId: string, filters: QueryFilters, limit?: number]
): Promise<ContactLinkEvent[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, filters: QueryFilters, limit = 50) {
  const { rawQuery, parseFilters } = prisma;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const { filterQuery, cohortQuery, joinSessionQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  return rawQuery(
    `
    select
      website_event.event_id as "id",
      website_event.created_at as "createdAt",
      max(case when event_data.data_key = 'clickedAt' then event_data.date_value end) as "clickedAt",
      website_event.event_name as "eventName",
      max(case when event_data.data_key = 'contactType' then event_data.string_value end) as "contactType",
      max(case when event_data.data_key = 'contactValue' then event_data.string_value end) as "contactValue",
      max(case when event_data.data_key = 'linkText' then event_data.string_value end) as "linkText",
      max(case when event_data.data_key = 'linkHref' then event_data.string_value end) as "linkHref",
      website_event.url_path as "urlPath"
    from website_event
    ${cohortQuery}
    ${joinSessionQuery}
    left join event_data on event_data.website_event_id = website_event.event_id
      and event_data.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      and website_event.event_type = 2
      and website_event.event_name in ('${PHONE_LINK_CLICK_EVENT}', '${EMAIL_LINK_CLICK_EVENT}')
      ${filterQuery}
    group by website_event.event_id, website_event.created_at, website_event.event_name, website_event.url_path
    order by website_event.created_at desc
    limit ${safeLimit}
    `,
    queryParams,
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters,
  limit = 50,
): Promise<ContactLinkEvent[]> {
  const { rawQuery, parseFilters } = clickhouse;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  return rawQuery(
    `
    select
      website_event.event_id as id,
      website_event.created_at as createdAt,
      maxIf(event_data.date_value, event_data.data_key = 'clickedAt') as clickedAt,
      website_event.event_name as eventName,
      maxIf(event_data.string_value, event_data.data_key = 'contactType') as contactType,
      maxIf(event_data.string_value, event_data.data_key = 'contactValue') as contactValue,
      maxIf(event_data.string_value, event_data.data_key = 'linkText') as linkText,
      maxIf(event_data.string_value, event_data.data_key = 'linkHref') as linkHref,
      website_event.url_path as urlPath
    from website_event
    ${cohortQuery}
    left join event_data on event_data.event_id = website_event.event_id
      and event_data.session_id = website_event.session_id
      and event_data.website_id = website_event.website_id
    where website_event.website_id = {websiteId:UUID}
      and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      and website_event.event_type = 2
      and website_event.event_name in ('${PHONE_LINK_CLICK_EVENT}', '${EMAIL_LINK_CLICK_EVENT}')
      ${filterQuery}
    group by website_event.event_id, website_event.created_at, website_event.event_name, website_event.url_path
    order by website_event.created_at desc
    limit ${safeLimit}
    `,
    queryParams,
    FUNCTION_NAME,
  );
}
