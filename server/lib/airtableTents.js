/**
 * The single Airtable client for the tents table.
 *
 * Airtable is the source of truth for tent data — nothing here caches records,
 * so a VP editing a row directly in Airtable is reflected on the site on the
 * very next request. Only the credentials are cached (see ./airtableConfig).
 */

const axios = require('axios');
const { getAirtableConfig } = require('./airtableConfig');

/** Thrown when Airtable credentials have not been configured in the LM dashboard. */
class AirtableConfigError extends Error {
  constructor() {
    super('Airtable config not set');
    this.name = 'AirtableConfigError';
  }
}

async function requireConfig() {
  const cfg = await getAirtableConfig();
  if (!cfg.airtableApiKey || !cfg.airtableBaseId || !cfg.airtableTableId) {
    throw new AirtableConfigError();
  }
  return cfg;
}

function tableUrl(cfg) {
  return `https://api.airtable.com/v0/${cfg.airtableBaseId}/${cfg.airtableTableId}`;
}

function authHeaders(cfg) {
  return { Authorization: `Bearer ${cfg.airtableApiKey}` };
}

/** Map a raw Airtable record onto the shape the rest of the app expects. */
function mapRecord(record) {
  return {
    id: record.id,
    order: record.fields['Order'] || 0,
    captain: record.fields['Captain'] || '',
    captainName: record.fields['Captain Name'] || '',
    members: record.fields['Members'] || '',
    name: record.fields['Name'] || '',
    netIDs: record.fields['netIDs'] || '',
    type: record.fields['Type'] || '',
    startDate: record.fields['Start Date'] || null,
    dayNumber: record.fields['Day Number'] || null,
    nightNumber: record.fields['Night Number'] || null,
    numberOfMisses: record.fields['Number of Misses'] || 0,
    lastCheck: record.fields['Last Check'] || null,
    dateOfLastCheck: record.fields['Date of Last Check'] || null,
    lastMissLM: record.fields['Last Miss LM'] || null,
    dateOfLastMiss: record.fields['Date of Last Miss'] || null,
  };
}

/** Every tent, following Airtable's pagination, sorted by Order. */
async function fetchAllTents() {
  const cfg = await requireConfig();

  let allRecords = [];
  let offset;
  do {
    const config = { headers: authHeaders(cfg), params: {} };
    if (offset) config.params.offset = offset;

    const response = await axios.get(tableUrl(cfg), config);
    const { records = [], offset: newOffset } = response.data;
    allRecords = allRecords.concat(records);
    offset = newOffset;
  } while (offset);

  return allRecords.map(mapRecord).sort((a, b) => a.order - b.order);
}

/** A single tent by Airtable record id, or null if it no longer exists. */
async function fetchTentById(recordId) {
  const cfg = await requireConfig();
  try {
    const response = await axios.get(`${tableUrl(cfg)}/${recordId}`, {
      headers: authHeaders(cfg),
    });
    return mapRecord(response.data);
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

/** Write fields back to a tent record. `fields` uses Airtable's column names. */
async function patchTent(recordId, fields) {
  const cfg = await requireConfig();
  const response = await axios.patch(
    `${tableUrl(cfg)}/${recordId}`,
    { fields },
    { headers: authHeaders(cfg) }
  );
  return mapRecord(response.data);
}

module.exports = {
  AirtableConfigError,
  fetchAllTents,
  fetchTentById,
  patchTent,
  mapRecord,
};
