"use strict";

// Execution only. Requests, selectors, pagination and filters live in source-definitions.js.
function sourceTemplate(template, values, encode = true) {
  return template.replace(/\{([A-Za-z]\w*)\}/g, (_, key) => {
    if (values[key] === undefined) throw new Error('Missing source parameter: ' + key);
    const value = String(values[key]);
    return encode && key !== 'homepage' ? encodeURIComponent(value) : value;
  });
}

function sourceConditions(when, values) {
  return Object.entries(when || {}).every(([key, value]) => values[key] === value);
}

function catalogResponse(url, body, headers = {}, validateResponse = true) {
  const response = body === undefined ? host.request({url, headers}) : host.request({
    url, method: 'POST', headers: {...headers, 'Content-Type': 'application/x-www-form-urlencoded'}, body
  });
  if (!validateResponse) return response;
  if (response.status === 403 || catalogDefaults.verificationTitlePattern.test(response.body)) {
    throw new Error('NORI_SITE_VERIFICATION_REQUIRED');
  }
  if (response.status !== 200 || !response.body.trim()) throw new Error('NORI_SEARCH_UNAVAILABLE');
  return response;
}

function sourceRequest(site, definition, parameters, cursor) {
  const request = Array.isArray(definition) ? definition.find(rule => sourceConditions(rule.when, parameters)) : definition;
  const values = {...parameters, homepage: site.homepage};
  for (const [key, mapping] of Object.entries(request.values || {})) {
    if (Object.hasOwn(mapping, values[key])) values[key] = mapping[values[key]];
  }
  const url = cursor || sourceTemplate(request.url, values);
  const body = !cursor && request.method === 'POST'
    ? Object.entries(request.form).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(sourceTemplate(value, values, false))).join('&')
    : undefined;
  return catalogResponse(url, body, request.headers || {}, request.validateResponse !== false);
}

function catalogParameters(site, input, searching) {
  const definitions = site.catalog ? (searching ? site.catalog.searchFilters : site.catalog.filters) : [];
  const filters = Object.fromEntries(definitions.map(filter => [filter.id, filter.defaultValue]));
  const page = Number(input.page || 1);
  return {...filters, ...input.filters, homepage: site.homepage, query: input.query || '', page, pageIndex: page - 1,
    offset: (page - 1) * (site.search?.pageSize || 1) + 1};
}

function catalogBooks(site, response, rule) {
  const rows = host.select(response.body, rule.items, rule.fields).map(row => {
    if (rule.fullTitlePattern) row.title = row.fullTitle.match(rule.fullTitlePattern)?.[1] || row.title;
    if (rule.titlePattern) row.title = row.title.replace(rule.titlePattern, '');
    if (rule.coverPattern) row.cover = row.coverStyle.match(rule.coverPattern)?.[2] || '';
    row.attributes = (rule.attributes || []).flatMap(attribute => {
      const raw = row[attribute.field] || '';
      const value = attribute.pattern ? raw.match(attribute.pattern)?.[1] : raw;
      return value?.trim() ? [{name: attribute.name, value: value.trim()}] : [];
    });
    return row;
  });
  return uniqueBooks(site, rows, response.url);
}

function catalogPageNumber(url, pattern) {
  return Number((pattern && String(url).match(pattern) || String(url).match(catalogDefaults.defaultPagePattern))?.[1] || 1);
}

function catalogNext(response, rule) {
  if (rule.mode === 'none') return null;
  const links = host.select(response.body, catalogDefaults.links.items, catalogDefaults.links.fields);
  if (rule.mode === 'next') {
    const next = links.find(link => link.text === rule.label);
    return next ? host.url(next.href, response.url) : null;
  }
  const page = catalogPageNumber(response.url, rule.pagePattern);
  const next = links.find(link => link.text === String(page + 1) || link.text === '第 ' + (page + 1) + ' 页')
    || links.find(link => catalogDefaults.nextPagePattern.test(link.text.trim()));
  return next ? host.url(next.href, response.url) : null;
}

function catalogEncodedQuery(query, encoding) {
  const alphabet = encoding.alphabet;
  const randomCharacter = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  return Array.from(encodeURI(query), character => {
    const index = alphabet.indexOf(character);
    const encoded = index < 0 ? character : alphabet[(index + encoding.shift) % alphabet.length];
    return randomCharacter() + encoded + randomCharacter();
  }).join('');
}

function catalogHTML(response, rule) {
  if (!rule) return response;
  const callback = rule.callback.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const payload = response.body.match(new RegExp('^\\s*' + callback + '\\(([\\s\\S]*)\\);?\\s*$'));
  if (!payload) throw new Error('Invalid search response');
  const result = JSON.parse(payload[1]);
  if (result[rule.statusField] !== rule.successValue || typeof result[rule.htmlField] !== 'string') {
    throw new Error('NORI_SEARCH_UNAVAILABLE');
  }
  return {...response, body: result[rule.htmlField]};
}

function websiteCatalog(input) {
  const site = website(input.siteID);
  const searching = typeof input.query === 'string' && input.query.trim().length > 0;
  const rule = searching ? site.catalog.search : site.catalog.library;
  if (!rule) throw new Error('NORI_SEARCH_UNAVAILABLE');
  const parameters = catalogParameters(site, input, searching);
  const sectionRule = rule.sections?.find(section => sourceConditions(section.when, parameters));
  if (sectionRule && !input.cursor) {
    const section = websiteHome(input).find(section => section.id === sectionRule.id);
    return {books: section.books, title: section.title, nextCursor: null};
  }
  if (rule.queryEncoding) parameters.encodedQuery = catalogEncodedQuery(input.query, rule.queryEncoding);
  if (rule.preflight && !input.cursor) sourceRequest(site, rule.preflight, parameters);
  let response = sourceRequest(site, rule.request, parameters, input.cursor);
  if (rule.verificationPattern?.test(response.body)) throw new Error('NORI_SITE_VERIFICATION_REQUIRED');
  if (rule.requireAny && !rule.requireAny.some(text => response.body.includes(text))) throw new Error('NORI_SEARCH_UNAVAILABLE');
  response = catalogHTML(response, rule.response);
  let books = catalogBooks(site, response, rule.rows);
  if (!books.length && rule.fallbackRows) books = catalogBooks(site, response, rule.fallbackRows);
  return {books, nextCursor: catalogNext(response, rule.pagination), title: ''};
}

function publicCatalogFilter(filter) {
  const {optionsSource, defaultSetting, ...definition} = filter;
  return definition;
}

function websiteCatalogFilters(input) {
  const site = website(input.siteID);
  const filters = input.query ? site.catalog.searchFilters : site.catalog.filters;
  return filters.map(filter => {
    let options = filter.options;
    if (filter.optionsSource) {
      const rule = filter.optionsSource;
      const parameters = catalogParameters(site, input, false);
      const response = sourceRequest(site, rule.request, parameters);
      options = [...rule.initialOptions];
      const seen = new Set(options.map(option => option.value));
      for (const link of host.select(response.body, rule.items, rule.fields)) {
        const value = link.href.match(rule.valuePattern)?.[1];
        if (!value || seen.has(value)) continue;
        seen.add(value);
        options.push({value, title: link.title.replace(rule.titlePattern, '')});
      }
      if (options.length < rule.minimumOptions) throw new Error('Missing category navigation');
    }
    return {...publicCatalogFilter(filter), options,
      defaultValue: filter.defaultSetting ? input.settings?.[filter.defaultSetting] || filter.defaultValue : filter.defaultValue};
  });
}
