(window => {
  const {
    screen: { width, height },
    navigator: { language, doNotTrack: ndnt, msDoNotTrack: msdnt },
    location,
    document,
    history,
    top,
    doNotTrack,
  } = window;
  const { currentScript, referrer } = document;
  if (!currentScript) return;

  const { hostname, href, origin } = location;

  let localStorage;
  try {
    localStorage = href.startsWith('data:') ? undefined : window.localStorage;
  } catch {
    /* (DOMException) SecurityError: Access is denied for this document. */
  }

  let sessionStorage;
  try {
    sessionStorage = href.startsWith('data:') ? undefined : window.sessionStorage;
  } catch {
    /* (DOMException) SecurityError: Access is denied for this document. */
  }

  const _data = 'data-';
  const _false = 'false';
  const _true = 'true';
  const attr = currentScript.getAttribute.bind(currentScript);
  const config = value => attr(`${_data}${value}`);

  const website = config('website-id');
  const hostUrl = config('host-url');
  const beforeSend = config('before-send');
  const tag = config('tag') || undefined;
  const autoTrack = config('auto-track') !== _false;
  const dnt = config('do-not-track') === _true;
  const excludeSearch = config('exclude-search') === _true;
  const excludeHash = config('exclude-hash') === _true;
  const domain = config('domains') || '';
  const credentials = config('fetch-credentials') || 'omit';
  const perf = config('performance') === _true;
  const autoPageview = config('auto-pageview') !== _false;

  const domains = domain.split(',').map(n => n.trim());
  const host =
    hostUrl || '__COLLECT_API_HOST__' || currentScript.src.split('/').slice(0, -1).join('/');
  const endpoint = `${host.replace(/\/$/, '')}__COLLECT_API_ENDPOINT__`;
  const screen = `${width}x${height}`;
  const eventRegex = /data-umami-event-([\w-_]+)/;
  const eventNameAttribute = `${_data}umami-event`;
  const delayDuration = 300;
  const contactFormEvent = 'Contact Form Submission';
  const contactFormPendingKey = 'umami.contact-form-pending';
  const contactFormPendingDuration = 10 * 60 * 1000;
  const jobberOrigin = 'https://clienthub.getjobber.com';

  /* Helper functions */

  const normalize = raw => {
    if (!raw) return raw;
    try {
      const u = new URL(raw, location.href);
      if (excludeSearch) u.search = '';
      if (excludeHash) u.hash = '';
      return u.toString();
    } catch {
      return raw;
    }
  };

  const getPayload = () => ({
    website,
    screen,
    language,
    title: document.title,
    hostname,
    url: currentUrl,
    referrer: currentRef,
    tag,
    id: identity ? identity : undefined,
  });

  const hasDoNotTrack = () => {
    const dnt = doNotTrack || ndnt || msdnt;
    return dnt === 1 || dnt === '1' || dnt === 'yes';
  };

  /* Event handlers */

  const handlePush = (_state, _title, url) => {
    if (!url) return;

    if (typeof flushPerformance === 'function') {
      flushPerformance();
    }

    currentRef = currentUrl;
    currentUrl = normalize(url);

    if (currentUrl !== currentRef && autoPageview) {
      setTimeout(track, delayDuration);
    }
  };

  const handlePathChanges = () => {
    const hook = (_this, method, callback) => {
      const orig = _this[method];
      return (...args) => {
        const result = orig.apply(_this, args);
        callback.apply(null, args);
        return result;
      };
    };

    history.pushState = hook(history, 'pushState', handlePush);
    history.replaceState = hook(history, 'replaceState', handlePush);
  };

  const handleClicks = () => {
    const getText = el => (el.textContent || el.getAttribute('aria-label') || '').trim();
    const decode = value => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };

    const getContactClick = el => {
      if (el.tagName !== 'A') return;

      const linkHref = (el.getAttribute('href') || '').trim();
      const lowerHref = linkHref.toLowerCase();
      const contactProtocol = lowerHref.startsWith('tel:')
        ? 'tel'
        : lowerHref.startsWith('sms:')
          ? 'sms'
          : lowerHref.startsWith('mailto:')
            ? 'mailto'
            : undefined;
      const contactType =
        contactProtocol === 'mailto' ? 'email' : contactProtocol ? 'phone' : undefined;

      if (!contactType) return;

      const contactValue = linkHref
        .slice(linkHref.indexOf(':') + 1)
        .split('?')[0]
        .trim();

      return {
        name: contactType === 'phone' ? 'Phone Link Click' : 'Email Link Click',
        data: {
          contactType,
          contactProtocol,
          contactValue: decode(contactValue),
          linkHref,
          linkText: getText(el).substring(0, 500),
          clickedAt: new Date().toISOString(),
        },
      };
    };

    const trackElement = async el => {
      const eventName = el.getAttribute(eventNameAttribute);
      if (eventName) {
        const eventData = {};

        el.getAttributeNames().forEach(name => {
          const match = name.match(eventRegex);
          if (match) eventData[match[1]] = el.getAttribute(name);
        });

        return track(eventName, eventData);
      }

      const contactClick = getContactClick(el);

      if (contactClick) {
        return track(contactClick.name, contactClick.data);
      }
    };
    const onClick = e => {
      const el = e.target;
      const eventEl = el.closest(`[${eventNameAttribute}],a`);
      if (!eventEl) return;
      if (!eventEl.getAttribute(eventNameAttribute) && !getContactClick(eventEl)) return;

      if (eventEl.tagName === 'A' && eventEl.href) {
        const { href, target } = eventEl;
        const external =
          target === '_blank' ||
          e.ctrlKey ||
          e.shiftKey ||
          e.metaKey ||
          (e.button && e.button === 1);
        if (!external) e.preventDefault();
        return trackElement(eventEl).finally(() => {
          if (!external) {
            (target === '_top' ? top.location : location).href = href;
          }
        });
      }

      return trackElement(eventEl);
    };
    document.addEventListener('click', onClick, true);
  };

  const handleFormSubmissions = () => {
    const pendingForms = [];
    const trackedExternalSubmissions = new Set();
    const trackedJobberSubmissions = new Set();
    let lastJobberSubmissionAt = 0;

    const getStorageValue = key => {
      try {
        return sessionStorage?.getItem(key);
      } catch {
        return null;
      }
    };

    const setStorageValue = (key, value) => {
      try {
        sessionStorage?.setItem(key, value);
      } catch {
        /* (DOMException) SecurityError: Access is denied for this document. */
      }
    };

    const removeStorageValue = key => {
      try {
        sessionStorage?.removeItem(key);
      } catch {
        /* (DOMException) SecurityError: Access is denied for this document. */
      }
    };

    const getFormFields = form =>
      Array.from(form.elements || [])
        .map(element => String(element.name || '').toLowerCase())
        .filter(Boolean);

    const getFormMetadata = form => {
      let actionPath = '';

      try {
        actionPath = new URL(form.getAttribute('action') || location.href, location.href).pathname;
      } catch {
        /* Ignore malformed form actions. */
      }

      return {
        formId: form.id || undefined,
        formName: form.getAttribute('name') || undefined,
        formAction: actionPath || undefined,
      };
    };

    const isContactForm = form => {
      if (form?.tagName !== 'FORM') return false;

      const metadata = getFormMetadata(form);
      const fields = getFormFields(form);
      const descriptor = [
        metadata.formId,
        metadata.formName,
        form.getAttribute('aria-label'),
        form.className,
        metadata.formAction,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const explicitContactForm =
        form.hasAttribute('data-contact-form') || form.getAttribute('data-form-type') === 'contact';
      const excludedForm =
        /newsletter|subscribe|search|login|sign[-_ ]?up|career|job[-_ ]?opportun/.test(descriptor);
      const namedContactForm =
        /contact|quote|estimate|service|request|appointment|booking|lead|inquiry|message|project/.test(
          descriptor,
        );
      const hasEmail = fields.some(field => field.includes('email'));
      const hasContactField = fields.some(field =>
        /message|comment|phone|service|project|address|description|details/.test(field),
      );

      if (excludedForm && !explicitContactForm) return false;
      return explicitContactForm || namedContactForm || (hasEmail && hasContactField);
    };

    const hasFilledHoneypot = form => {
      const honeypot = form.querySelector('[name="bot-field"], [name="honeypot"]');
      return Boolean(honeypot?.value?.trim());
    };

    const getRequestDetails = (input, init) => {
      const rawUrl = typeof input === 'string' ? input : input?.url;
      const rawMethod = init?.method || input?.method || 'GET';

      if (!rawUrl) return null;

      try {
        const requestUrl = new URL(rawUrl, location.href);
        return {
          method: String(rawMethod).toUpperCase(),
          url: requestUrl,
        };
      } catch {
        return null;
      }
    };

    const isAnalyticsRequest = requestUrl => {
      try {
        const analyticsUrl = new URL(endpoint, location.href);
        return (
          analyticsUrl.origin === requestUrl.origin && analyticsUrl.pathname === requestUrl.pathname
        );
      } catch {
        return false;
      }
    };

    const isLikelyFormRequest = (record, request) => {
      if (request?.method !== 'POST' || isAnalyticsRequest(request.url)) return false;

      if (record.formAction && request.url.origin === location.origin) {
        if (record.formAction === request.url.pathname) return true;
      }

      const requestDescriptor = `${request.url.hostname}${request.url.pathname}`.toLowerCase();
      if (
        /contact|form|submit|lead|request|inquiry|netlify|hubspot|email|message/.test(
          requestDescriptor,
        )
      ) {
        return true;
      }

      // Third-party form providers often use opaque endpoint paths. A POST made
      // immediately after a contact form submit is still a better signal than
      // the submit attempt itself, which is intentionally never tracked.
      return request.url.origin !== location.origin;
    };

    const cleanupPendingForms = () => {
      const cutoff = Date.now() - contactFormPendingDuration;
      while (pendingForms.length && pendingForms[0].submittedAt < cutoff) {
        pendingForms.shift();
      }
    };

    const clearPendingMarker = id => {
      const marker = getStorageValue(contactFormPendingKey);
      if (!marker) return;

      try {
        if (JSON.parse(marker).id === id) {
          removeStorageValue(contactFormPendingKey);
        }
      } catch {
        removeStorageValue(contactFormPendingKey);
      }
    };

    const sendContactFormEvent = (metadata, source, provider = 'contact', extra = {}) => {
      track(contactFormEvent, {
        ...metadata,
        formType: provider,
        successSource: source,
        status: 'success',
        ...extra,
      });
    };

    const markFormSuccess = (record, source, extra = {}) => {
      if (!record || record.completed) return;

      record.completed = true;
      clearPendingMarker(record.id);
      sendContactFormEvent(record.metadata, source, 'contact', extra);
    };

    const getPendingFormForRequest = request => {
      cleanupPendingForms();

      const candidates = pendingForms.filter(record => !record.completed);
      return candidates
        .slice()
        .reverse()
        .find(record => isLikelyFormRequest(record, request));
    };

    const getPendingFormForElement = element => {
      cleanupPendingForms();
      return pendingForms
        .slice()
        .reverse()
        .find(record => !record.completed && record.form === element);
    };

    const installFetchTracking = () => {
      const originalFetch = window.fetch;
      if (typeof originalFetch !== 'function' || originalFetch.__umamiContactFormTracker) return;

      const trackedFetch = function (input, init, ...rest) {
        const request = getRequestDetails(input, init);
        const record = getPendingFormForRequest(request);
        const result = originalFetch.call(this, input, init, ...rest);

        if (!record) return result;

        return Promise.resolve(result).then(response => {
          if (response?.ok) {
            markFormSuccess(record, 'fetch', { submissionEndpoint: request.url.pathname });
          }

          return response;
        });
      };

      trackedFetch.__umamiContactFormTracker = true;
      window.fetch = trackedFetch;
    };

    const isSuccessIndicator = element => {
      if (element?.nodeType !== 1) return false;

      if (
        element.matches?.(
          '.cs-form-status-success, .form-success, .success-message, [data-form-success], [data-form-success="true"]',
        )
      ) {
        return true;
      }

      return (
        element.matches?.('[role="status"]') &&
        /thank|received|success|submitted|sent|confirmation/i.test(element.textContent || '')
      );
    };

    const getSuccessForm = element => {
      if (!element) return null;
      if (element.tagName === 'FORM') return element;
      return element.closest?.('form') || element.querySelector?.('form');
    };

    const observeFormSuccess = () => {
      if (!window.MutationObserver || !document.body) return;

      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          Array.from(mutation.addedNodes).forEach(node => {
            if (isSuccessIndicator(node)) {
              const form = getSuccessForm(node);
              if (form) markFormSuccess(getPendingFormForElement(form), 'dom');
            }

            node
              .querySelectorAll?.(
                '.cs-form-status-success, .form-success, .success-message, [data-form-success], [data-form-success="true"]',
              )
              .forEach(successElement => {
                const form = getSuccessForm(successElement);
                if (form) markFormSuccess(getPendingFormForElement(form), 'dom');
              });
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    };

    const getJobberScript = () =>
      Array.from(document.querySelectorAll('script[src]')).find(script =>
        /work_request_embed_snippet\.js/i.test(script.getAttribute('src') || ''),
      );

    const getJobberId = script => script?.getAttribute('clienthub_id') || undefined;

    const isJobberSuccessMessage = data => {
      let message = '';

      try {
        message = typeof data === 'string' ? data : JSON.stringify(data || {});
      } catch {
        return false;
      }

      const normalized = message.toLowerCase();
      if (/error|fail|invalid|denied|declined/.test(normalized)) return false;
      return /form[ _-]?submit|submission|submitted|success|complete|confirmation|generate_lead|thank/.test(
        normalized,
      );
    };

    const getJobberSubmissionId = data => {
      if (!data || typeof data !== 'object') return '';
      return String(
        data.submissionId || data.submission_id || data.requestId || data.request_id || '',
      );
    };

    const handleJobberMessage = event => {
      if (event.origin !== jobberOrigin || !isJobberSuccessMessage(event.data)) return;

      const script = getJobberScript();
      if (!script) return;

      const formId = getJobberId(script);
      const submissionId = getJobberSubmissionId(event.data);
      const dedupeKey = submissionId ? `${formId}:${submissionId}` : '';
      const now = Date.now();

      if (dedupeKey && trackedJobberSubmissions.has(dedupeKey)) return;
      if (!dedupeKey && now - lastJobberSubmissionAt < 1500) return;

      if (dedupeKey) trackedJobberSubmissions.add(dedupeKey);
      lastJobberSubmissionAt = now;
      sendContactFormEvent(
        {
          formId,
          formAction:
            'https://clienthub.getjobber.com/client_hubs/*/public/work_request/embedded_work_request_form',
        },
        'jobber',
        'jobber',
        submissionId ? { submissionId } : {},
      );
    };

    const handleHubSpotMessage = event => {
      const data = event.data;
      if (data?.type !== 'hsFormCallback' || data.eventName !== 'onFormSubmitted') return;

      const formId = data.id ? String(data.id) : undefined;
      const dedupeKey = `hubspot:${formId || 'unknown'}`;
      if (trackedExternalSubmissions.has(dedupeKey)) return;

      trackedExternalSubmissions.add(dedupeKey);
      sendContactFormEvent({ formId }, 'hubspot', 'hubspot');
    };

    const handleExternalFormEvents = () => {
      window.addEventListener('message', event => {
        handleHubSpotMessage(event);
        handleJobberMessage(event);
      });

      window.addEventListener('hs-form-event:on-submission:success', event => {
        const formId = event.detail?.formId ? String(event.detail.formId) : undefined;
        const dedupeKey = `hubspot:${formId || 'unknown'}`;
        if (trackedExternalSubmissions.has(dedupeKey)) return;

        trackedExternalSubmissions.add(dedupeKey);
        sendContactFormEvent({ formId }, 'hubspot', 'hubspot');
      });
    };

    const readPendingMarker = () => {
      const marker = getStorageValue(contactFormPendingKey);
      if (!marker) return null;

      try {
        const parsed = JSON.parse(marker);
        if (!parsed.submittedAt || Date.now() - parsed.submittedAt > contactFormPendingDuration) {
          removeStorageValue(contactFormPendingKey);
          return null;
        }
        return parsed;
      } catch {
        removeStorageValue(contactFormPendingKey);
        return null;
      }
    };

    const checkSuccessPage = () => {
      if (!/(?:contact\/)?(?:success|thank[-_ ]?you|thanks)(?:\/|$)/i.test(location.pathname))
        return;

      const marker = readPendingMarker();
      if (!marker) return;

      removeStorageValue(contactFormPendingKey);
      sendContactFormEvent(marker.metadata || {}, 'success-page');
    };

    document.addEventListener(
      'submit',
      event => {
        const form = event.target;
        if (!isContactForm(form) || hasFilledHoneypot(form)) return;

        cleanupPendingForms();
        const metadata = getFormMetadata(form);
        const record = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          form,
          metadata,
          submittedAt: Date.now(),
          completed: false,
        };

        pendingForms.push(record);
        setStorageValue(
          contactFormPendingKey,
          JSON.stringify({ id: record.id, submittedAt: record.submittedAt, metadata }),
        );
      },
      true,
    );

    installFetchTracking();
    observeFormSuccess();
    handleExternalFormEvents();
    checkSuccessPage();
  };

  /* Tracking functions */

  const trackingDisabled = () =>
    disabled ||
    !website ||
    localStorage?.getItem('umami.disabled') ||
    (domain && !domains.includes(hostname)) ||
    (dnt && hasDoNotTrack());

  const send = async (payload, type = 'event') => {
    if (trackingDisabled()) return;

    const callback = window[beforeSend];

    if (typeof callback === 'function') {
      payload = await Promise.resolve(callback(type, payload));
    }

    if (!payload) return;

    try {
      const res = await fetch(endpoint, {
        keepalive: true,
        method: 'POST',
        body: JSON.stringify({ type, payload }),
        headers: {
          'Content-Type': 'application/json',
          'x-umami-website-id': website,
          'x-umami-hostname': hostname,
          ...(typeof cache !== 'undefined' && { 'x-umami-cache': cache }),
        },
        credentials,
      });

      const data = await res.json();
      if (data) {
        disabled = !!data.disabled;
        cache = data.cache;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      /* no-op */
    }
  };

  const init = () => {
    if (!initialized) {
      initialized = true;
      if (autoPageview) track();
      handleFormSubmissions();
      handlePathChanges();
      handleClicks();
      if (perf) initPerformance();
    }
  };

  const track = (name, data) => {
    if (typeof name === 'string') return send({ ...getPayload(), name, data });
    if (typeof name === 'object') return send({ ...name });
    if (typeof name === 'function') return send(name(getPayload()));
    return send(getPayload());
  };

  const identify = (id, data) => {
    if (typeof id === 'string') {
      identity = id;
    }

    cache = '';
    return send(
      {
        ...getPayload(),
        data: typeof id === 'object' ? id : data,
      },
      'identify',
    );
  };

  /* Performance */

  const initPerformance = () => {
    const metrics = {};
    let sent = false;
    let timeoutId;
    let isInitialLoad = true;
    let activationStart = 0;
    let pageStartTime = 0;

    const observe = (type, callback) => {
      try {
        const observer = new PerformanceObserver(list => {
          list.getEntries().forEach(callback);
        });
        observer.observe({ type, buffered: true });
      } catch {
        /* not supported */
      }
    };

    // TTFB
    observe('navigation', entry => {
      activationStart = entry.activationStart || 0;
      metrics.ttfb = Math.max(entry.responseStart - activationStart, 0);
    });

    // FCP
    observe('paint', entry => {
      if (entry.name === 'first-contentful-paint') {
        metrics.fcp = Math.max(entry.startTime - activationStart, 0);
      }
    });

    // LCP
    observe('largest-contentful-paint', entry => {
      metrics.lcp = Math.max(entry.startTime - activationStart, 0);
    });

    // CLS - session windows algorithm (gap < 1s, max 5s duration; report worst window)
    let clsSessionValue = 0;
    let clsSessionEntries = [];
    observe('layout-shift', entry => {
      if (!entry.hadRecentInput) {
        const lastEntry = clsSessionEntries[clsSessionEntries.length - 1];
        const firstEntry = clsSessionEntries[0];
        if (
          lastEntry &&
          entry.startTime - lastEntry.startTime - lastEntry.duration < 1000 &&
          entry.startTime - firstEntry.startTime < 5000
        ) {
          clsSessionValue += entry.value;
          clsSessionEntries.push(entry);
        } else {
          clsSessionValue = entry.value;
          clsSessionEntries = [entry];
        }
        if (clsSessionValue > (metrics.cls || 0)) {
          metrics.cls = clsSessionValue;
        }
      }
    });

    // INP - group by interactionId, 98th percentile, 40ms threshold
    let interactions = {};
    let inpObserver;
    const recordInteractions = entries => {
      entries.forEach(entry => {
        if (entry.interactionId) {
          const existing = interactions[entry.interactionId];
          if (!existing || entry.duration > existing) {
            interactions[entry.interactionId] = entry.duration;
          }
        }
      });
    };
    try {
      inpObserver = new PerformanceObserver(list => recordInteractions(list.getEntries()));
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch {
      /* not supported */
    }

    const computeInp = () => {
      if (inpObserver) recordInteractions(inpObserver.takeRecords());
      const values = Object.values(interactions).sort((a, b) => b - a);
      if (values.length) {
        const p98Index = Math.floor(Math.max(values.length, 10) * 0.02);
        metrics.inp = values[Math.min(p98Index, values.length - 1)];
      }
    };

    const getEntriesByType = type => {
      try {
        return window.performance?.getEntriesByType?.(type) || [];
      } catch {
        return [];
      }
    };

    const applyFallbackMetrics = () => {
      if (!isInitialLoad) return;

      if (metrics.ttfb === undefined) {
        const navigation = getEntriesByType('navigation')?.[0];
        if (navigation) {
          metrics.ttfb = Math.max(navigation.responseStart - (navigation.activationStart || 0), 0);
        }
      }

      if (metrics.fcp === undefined) {
        const fcpEntry = getEntriesByType('paint')?.find(
          entry => entry.name === 'first-contentful-paint',
        );
        if (fcpEntry) {
          metrics.fcp = Math.max(fcpEntry.startTime - activationStart, 0);
        }
      }

      if (metrics.lcp === undefined) {
        const lcpEntries = getEntriesByType('largest-contentful-paint');
        const lcpEntry = lcpEntries?.[lcpEntries.length - 1];
        if (lcpEntry) {
          metrics.lcp = Math.max(lcpEntry.startTime - activationStart, 0);
        }
      }
    };

    const sendPerformance = () => {
      if (sent) return;

      applyFallbackMetrics();
      computeInp();
      metrics.duration = Math.round(performance.now() - pageStartTime);

      sent = true;
      if (timeoutId) clearTimeout(timeoutId);
      send({ ...getPayload(), ...metrics }, 'performance');
    };

    flushPerformance = () => {
      sendPerformance();
      isInitialLoad = false;
      Object.keys(metrics).forEach(k => {
        delete metrics[k];
      });
      activationStart = 0;
      pageStartTime = performance.now();
      clsSessionValue = 0;
      clsSessionEntries = [];
      interactions = {};
      sent = false;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(sendPerformance, 10000);
    };
    timeoutId = setTimeout(sendPerformance, 10000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sendPerformance();
    });
    window.addEventListener('pagehide', sendPerformance);
  };

  /* Start */

  if (!window.umami) {
    window.umami = {
      track,
      identify,
      getSession: () => ({ cache, website }),
    };
  }

  let currentUrl = normalize(href);
  let currentRef = normalize(referrer.startsWith(origin) ? '' : referrer);

  let initialized = false;
  let disabled = false;
  let cache;
  let identity;
  let flushPerformance;

  if (autoTrack && !trackingDisabled()) {
    if (document.readyState === 'complete') {
      init();
    } else {
      document.addEventListener('readystatechange', init, true);
    }
  }
})(window);
