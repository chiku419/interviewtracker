const axios = require('axios');
const { parse } = require('csv-parse/sync');

// Prefer environment variable, fall back to legacy hardcoded ID for backwards compatibility
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1lpIbY3IzIOfGmIV0YLb7oC4uJ6GcBj_w0S8k8SBaAvY';

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

async function fetchSheetByName(sheetName) {
  try {
    // Fetch from specific sheet by name (gid parameter for sheet ID, but we use sheet name in export)
    const csvURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    
    // Try direct fetch
    let response;
    try {
      response = await axios.get(csvURL, {
        headers: { 'Accept': 'text/csv' },
        timeout: 5000
      });
    } catch (error) {
      // Fallback to CORS proxy
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvURL)}`;
      response = await axios.get(proxyUrl, { timeout: 5000 });
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

module.exports = { fetchAndParseSheets };
