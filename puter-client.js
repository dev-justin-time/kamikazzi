import { ai } from 'https://esm.sh/puter-js@latest';

/* puter-client.js
   Robust dynamic import for @heyputer/puter.js with multiple export shapes.
   Exposes window.__puterSendIdeas, window.addSkyIdea, and window.setPuterApiKey.
*/

let client = null;
let currentKey = null;
const SERVICE_NAME = 'kamikazzi-radio';

// Inspect module and return a factory function that creates a client when given a key.
async function resolvePuterFactory() {
  try {
    const mod = await import('https://esm.sh/@heyputer/puter.js');
    // Common shapes we might encounter:
    //  - default export is a function: export default function puter() {}
    //  - named export 'puter' is a function: export function puter() {}
    //  - default export is an object with .puter fn: export default { puter: fn }
    //  - module exports a class/object with .createClient or similar (fallback)
    if (typeof mod === 'function') return mod;
    if (mod && typeof mod.default === 'function') return mod.default;
    if (mod && typeof mod.puter === 'function') return mod.puter;
    if (mod && typeof mod.default === 'object' && typeof mod.default.puter === 'function') return mod.default.puter;
    // last-resort: try a named 'defaultPuter' or 'create' function
    if (mod && typeof mod.defaultPuter === 'function') return mod.defaultPuter;
    if (mod && typeof mod.create === 'function') return mod.create;
    console.warn('puter-client: could not resolve factory from module exports', mod);
    return null;
  } catch (e) {
    console.warn('puter-client: dynamic import failed', e);
    return null;
  }
}

async function createClientFromKey(key) {
  if (!key) return null;
  const factory = await resolvePuterFactory();
  if (!factory) return null;
  try {
    const maybeClient = factory({ apiKey: key, service: SERVICE_NAME });
    // factory might return a Promise or the client directly
    return maybeClient && typeof maybeClient.then === 'function' ? await maybeClient : maybeClient;
  } catch (e) {
    console.warn('puter-client: factory threw when creating client', e);
    return null;
  }
}

// Try to initialize from stored key on load (async)
(async function initFromStorage() {
  try {
    currentKey = localStorage.getItem('puterApiKey') || null;
    if (currentKey) {
      client = await createClientFromKey(currentKey);
      if (client) console.log('puter-client: initialized from stored key.');
    }
  } catch (e) {
    currentKey = null;
    client = null;
  }
})();

// Public: set / update API key at runtime and persist it
window.setPuterApiKey = async function(key) {
  try {
    if (!key) {
      localStorage.removeItem('puterApiKey');
      client = null;
      currentKey = null;
      console.log('puter-client: API key cleared.');
      return;
    }
    localStorage.setItem('puterApiKey', key);
    currentKey = key;
    client = await createClientFromKey(key);
    if (client) console.log('puter-client: API key saved and client initialized.');
    else console.warn('puter-client: client not initialized after setting key.');
  } catch (e) {
    console.warn('puter-client: failed to set API key', e);
  }
};

// Expose a global helper so the main game script can call it without bundling.
window.__puterSendIdeas = async function(payload) {
  // payload: { score, timestamp, ideas: [...] }
  if (!client || typeof client.create !== 'function') {
    // no client available; resolve so callers don't break
    return Promise.resolve();
  }
  try {
    await client.create({
      type: 'run_feedback',
      data: {
        score: payload.score,
        ts: payload.timestamp,
        ideas: payload.ideas
      }
    });
  } catch (err) {
    console.warn('puter send failed', err);
  }
};

// Optional helper to add a new idea into local storage
window.addSkyIdea = function(text, author) {
  try {
    const key = 'kamikazziBriefings';
    const stored = localStorage.getItem(key);
    const list = stored ? JSON.parse(stored) : [];
    list.push({ from: author || 'player', idea: text, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(list));
    // notify game that ideas were updated
    try { window.dispatchEvent(new Event('ideasUpdated')); } catch (e) {}
  } catch (e) {
    console.warn('addSkyIdea failed', e);
  }
};

// Attempt to fetch comments/ideas from the remote puter service (best-effort).
// This will try a few common client API shapes to list or query stored items and then persist them locally.
window.fetchCommentsFromPuter = async function() {
  if (!client) return;
  try {
    let items = [];
    // try a few common methods
    if (typeof client.list === 'function') {
      items = await client.list({ limit: 50 });
      // normalize if necessary
      if (Array.isArray(items) && items.length && items[0].data) {
        items = items.map(i => ({ from: i.id || 'remote', idea: (i.data && (i.data.idea || i.data.text || i.data.ideas)) || JSON.stringify(i.data), ts: i.created_at || Date.now() }));
      }
    } else if (typeof client.query === 'function') {
      const res = await client.query({ type: 'run_feedback', limit: 50 });
      items = Array.isArray(res) ? res : (res && res.items) || [];
      if (items.length && items[0].data) {
        items = items.map(i => ({ from: i.id || 'remote', idea: (i.data && (i.data.idea || i.data.text || i.data.ideas)) || JSON.stringify(i.data), ts: i.created_at || Date.now() }));
      }
    } else if (typeof client.get === 'function') {
      // fallback: try to get a collection name
      try {
        const res = await client.get('comments');
        items = Array.isArray(res) ? res : [];
      } catch (e) { items = []; }
    }
    // If we have simple strings already, normalize to objects
    if (Array.isArray(items) && items.length) {
      const normalized = items.map(it => {
        if (typeof it === 'string') return { from: 'remote', idea: it, ts: Date.now() };
        if (it && it.idea) return it;
        if (it && it.data && typeof it.data === 'string') return { from: it.id || 'remote', idea: it.data, ts: it.created_at || Date.now() };
        if (it && it.data && it.data.ideas) return { from: it.id || 'remote', idea: Array.isArray(it.data.ideas) ? it.data.ideas.join(' | ') : String(it.data.ideas), ts: it.created_at || Date.now() };
        return { from: it.id || 'remote', idea: JSON.stringify(it), ts: Date.now() };
      });
      // merge with local ideas (simple append dedupe by text)
      const key = 'kamikazziBriefings';
      const local = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = new Set(local.map(i => (i.idea || '').trim()));
      normalized.forEach(n => {
        if (!existing.has((n.idea || '').trim())) local.push({ from: n.from || 'remote', idea: n.idea || '', ts: n.ts || Date.now() });
      });
      localStorage.setItem(key, JSON.stringify(local));
      // notify the game that ideas were updated
      try { window.dispatchEvent(new Event('ideasUpdated')); } catch (e) {}
    }
  } catch (e) {
    console.warn('fetchCommentsFromPuter failed', e);
  }
};

// Expose a helper to generate game events from a comment using the ai.chat API.
// Returns the raw assistant content (expected to be JSON) or null on error.
window.generateFromComment = async function(text) {
  if (!text) return null;
  if (typeof ai === 'undefined' || !ai || !ai.chat || !ai.chat.completions) {
    console.warn('generateFromComment: ai.chat.completions not available.');
    return null;
  }
  try {
    const response = await ai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You generate game events in JSON only." },
        { role: "user", content: text }
      ]
    });

    // support different response shapes
    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      return response.choices[0].message.content;
    } else if (response && response.choices && response.choices[0] && response.choices[0].text) {
      return response.choices[0].text;
    } else if (response && response.content) {
      return response.content;
    }
    return null;
  } catch (err) {
    console.warn('generateFromComment failed', err);
    return null;
  }
};