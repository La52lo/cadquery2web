const axios = require('axios');

const GROQ_URL = process.env.GROQ_URL || null; // e.g. https://your-groq-service.example.com/query
const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '10000', 10);

if (!GROQ_URL) {
  console.warn('Warning: GROQ_URL is not configured. /prompt will fail until GROQ_URL is set.');
}

/**
 * Execute a GROQ query against a generic GROQ service.
 * Expects the GROQ service to accept POST { query, params } and return JSON.
 * Returns the raw response body (resp.data) for downstream processing.
 *
 * - query: string (GROQ query)
 * - params: object mapping parameter names to values (these will be sent as-is)
 */
async function groqFetch(query, params = {}) {
  if (!GROQ_URL) {
    throw new Error('GROQ_URL must be configured to use groqFetch');
  }
  if (!query || typeof query !== 'string') {
    throw new Error('groq query must be a non-empty string');
  }

  const payload = { query, params };

  const headers = {
    'Content-Type': 'application/json'
  };
  if (GROQ_API_KEY) headers['Authorization'] = `Bearer ${GROQ_API_KEY}`;

  const resp = await axios.post(GROQ_URL, payload, {
    headers,
    timeout: GROQ_TIMEOUT_MS
  });

  if (!(resp && resp.status >= 200 && resp.status < 300)) {
    throw new Error(`GROQ service error ${resp?.status}: ${resp?.statusText || 'unknown'}`);
  }

  if (!resp.data) {
    throw new Error('Empty response from GROQ service');
  }

  return resp.data;
}

module.exports = { groqFetch };