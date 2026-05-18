import { buildPath } from '@/lib/url';

export interface ErrorResponse {
  error: {
    status: number;
    message: string;
    code?: string;
  };
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  data?: any;
  error?: ErrorResponse;
}

export async function request(
  method: string,
  url: string,
  body?: string,
  headers: object = {},
): Promise<FetchResponse> {
  return fetch(url, {
    method,
    cache: 'no-cache',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  }).then(async res => {
    const contentType = res.headers.get('content-type') || '';
    let data: any = null;

    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');

      data = res.ok
        ? text
        : {
            error: {
              status: res.status,
              message: text || res.statusText || 'Request failed.',
            },
          };
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  });
}

export async function httpGet(path: string, params: object = {}, headers: object = {}) {
  return request('GET', buildPath(path, params), undefined, headers);
}

export async function httpDelete(path: string, params: object = {}, headers: object = {}) {
  return request('DELETE', buildPath(path, params), undefined, headers);
}

export async function httpPost(path: string, params: object = {}, headers: object = {}) {
  return request('POST', path, JSON.stringify(params), headers);
}

export async function httpPut(path: string, params: object = {}, headers: object = {}) {
  return request('PUT', path, JSON.stringify(params), headers);
}
