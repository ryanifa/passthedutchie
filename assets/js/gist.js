/* The only place that talks to the GitHub Gist API. */

const API = 'https://api.github.com';

export class GistError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

function errorFor(status, body) {
  const msg = body?.message || '';
  if (status === 401) return new GistError('De sleutel klopt niet of is verlopen.', { status });
  if (status === 403 && /rate limit/i.test(msg)) return new GistError('Te veel verzoeken naar GitHub. Probeer het zo opnieuw.', { status });
  if (status === 403) return new GistError('De sleutel heeft geen rechten voor Gists.', { status });
  if (status === 404) return new GistError('Gist niet gevonden (of hij hoort niet bij deze sleutel).', { status });
  if (status === 422) return new GistError(`GitHub weigerde de gegevens: ${msg}`, { status });
  if (status >= 500) return new GistError('GitHub is even niet bereikbaar.', { status });
  return new GistError(msg || `Onverwacht antwoord van GitHub (${status}).`, { status });
}

async function request(path, { token, method = 'GET', body, timeout = 15000 } = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(API + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: abort.signal, cache: 'no-store',
    });
  } catch {
    throw new GistError('Geen verbinding met GitHub.', { network: true });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { /* not JSON */ } }
  if (!res.ok) throw errorFor(res.status, data);
  return data;
}

/** Checks that the key works and may manage gists. Returns the GitHub login. */
export async function checkToken(token) {
  const user = await request('/user', { token });
  await request('/gists?per_page=1', { token });
  return user?.login || null;
}

/** Reads one JSON file from a gist. Works without a token for public and secret gists. */
export async function readGist(gistId, fileName, token) {
  const data = await request(`/gists/${encodeURIComponent(gistId)}`, { token });
  const file = data.files?.[fileName] || Object.values(data.files || {})[0];
  if (!file) throw new GistError('De Gist bevat geen menubestand.');
  let content = file.content ?? '';
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { cache: 'no-store' });
    content = await raw.text();
  }
  let doc;
  try { doc = JSON.parse(content); } catch { throw new GistError('Het menubestand in de Gist is geen geldige JSON.'); }
  return { doc, updatedAt: data.updated_at, owner: data.owner?.login || null };
}

/** CDN copy of the file: no rate limit, but may lag a few minutes behind. */
export async function readGistRaw(owner, gistId, fileName) {
  const url = `https://gist.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(gistId)}/raw/${encodeURIComponent(fileName)}`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new GistError('Geen verbinding met GitHub.', { network: true });
  }
  if (!res.ok) throw errorFor(res.status, null);
  return { doc: JSON.parse(await res.text()), updatedAt: null };
}

export async function createGist(token, fileName, doc) {
  const data = await request('/gists', {
    token,
    method: 'POST',
    body: {
      description: 'Pass The Dutchie — menu & website data (beheerd via beheer.html)',
      public: true,
      files: { [fileName]: { content: JSON.stringify(doc, null, 1) } },
    },
  });
  return { id: data.id, updatedAt: data.updated_at };
}

export async function writeGist(token, gistId, fileName, doc) {
  const data = await request(`/gists/${encodeURIComponent(gistId)}`, {
    token,
    method: 'PATCH',
    body: { files: { [fileName]: { content: JSON.stringify(doc, null, 1) } } },
  });
  return { updatedAt: data.updated_at };
}
