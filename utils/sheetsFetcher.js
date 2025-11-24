const axios = require('axios');
const { parse } = require('csv-parse/sync');

// Prefer environment variable, fall back to legacy hardcoded ID for backwards compatibility
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1lpIbY3IzIOfGmIV0YLb7oC4uJ6GcBj_w0S8k8SBaAvY';
// Configurable fetch timeout and retry attempts
const TIMEOUT_MS = parseInt(process.env.SHEET_FETCH_TIMEOUT_MS || '15000', 10);
const MAX_FETCH_ATTEMPTS = parseInt(process.env.SHEET_FETCH_ATTEMPTS || '2', 10);

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Normalize column names for Round 2 data
function normalizeRound2Row(row) {
  return {
    'Sr. No.': row['Sr. No.'],
    'Name': row['Name'],
    'Email': row['Email'] || row['email'] || '', // Round 2 might not have email, use empty fallback
    'Panelist Name - Room': row['Panelist Name - Room'],
    'Status': row['Status'],
    // Keep original row data as well for compatibility
    ...row
  };
}

async function fetchSheetByName(sheetName, targetSheetId = null) {
  try {
    // Use provided sheet ID or fall back to default
    const targetId = targetSheetId || SHEET_ID;
    if (!targetId) throw new Error('No Sheet ID provided and default GOOGLE_SHEET_ID is not set');

    // Fetch from specific sheet by name (gid parameter for sheet ID, but we use sheet name in export)
    const csvURL = `https://docs.google.com/spreadsheets/d/${targetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

    let response;
    let lastErr;
    // Try a couple of attempts before failing, try direct then proxy per attempt
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        response = await axios.get(csvURL, {
          headers: { 'Accept': 'text/csv' },
          timeout: TIMEOUT_MS
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`fetchSheetByName: direct fetch attempt ${attempt} failed for sheet="${sheetName}" (${csvURL}): ${err.message}`);
        // Try CORS proxy as a fallback
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvURL)}`;
          response = await axios.get(proxyUrl, { timeout: TIMEOUT_MS });
          lastErr = null;
          break;
        } catch (err2) {
          lastErr = err2;
          console.warn(`fetchSheetByName: proxy fetch attempt ${attempt} failed for sheet="${sheetName}": ${err2.message}`);
        }
      }

      // wait a bit before retrying (backoff)
      if (attempt < MAX_FETCH_ATTEMPTS) await sleep(500 * attempt);
    }

    if (!response) {
      // provide a helpful error message including sheetName and sheet id
      throw new Error(`Failed to fetch sheet "${sheetName}" after ${MAX_FETCH_ATTEMPTS} attempts: ${lastErr ? lastErr.message : 'no response'}`);
    }

    const csv = response.data;

    // Parse CSV
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    return records;
  } catch (error) {
    throw new Error(`Failed to fetch sheet "${sheetName}": ${error.message}`);
  }
}

async function fetchAndParseSheets() {
  try {
    // Try to fetch from named sheets first (Round 1 and Round 2)
    let round1 = [];
    let round2 = [];

    try {
      round1 = await fetchSheetByName('round1');
    } catch (error) {
      console.log('Could not fetch "round1" sheet, trying fallback...');
      // Fallback: fetch default sheet and filter
      const allSheets = await fetchSheetByName('');
      round1 = allSheets.filter(row => {
        const panel = row['Round 1 Panel'] || row['Round1 Panel'] || row['Round1Panel'];
        return panel && panel.trim() !== '';
      });
    }

    try {
      round2 = await fetchSheetByName('round2');
      // Normalize Round 2 row structure for compatibility
      round2 = round2.map(normalizeRound2Row);
    } catch (error) {
      console.log('Could not fetch "round2" sheet, trying fallback...');
      // Fallback: fetch default sheet and filter
      const allSheets = await fetchSheetByName('');
      round2 = allSheets.filter(row => {
        const panel = row['Round 2 Panel'] || row['Round2 Panel'] || row['Round2Panel'];
        return panel && panel.trim() !== '';
      });
    }

    return { round1, round2 };
  } catch (error) {
    throw new Error(`Failed to fetch sheets: ${error.message}`);
  }
}

module.exports = { fetchAndParseSheets, fetchSheetByName };
