require('dotenv').config();
const express = require('express');
const path = require('path');
const { fetchAndParseSheets, fetchSheetByName } = require('./utils/sheetsFetcher');
const { filterAndGroupData } = require('./utils/dataProcessor');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'interview-tracker-secret-key';
const PLACEMENT_SHEET_ID = '1P6G0Ov1qG63WuDgvne2N582WL_C9DMI_RFUDA9Y1NOc';

// Import JWT
const jwt = require('jsonwebtoken');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Admin auth middleware
function verifyAdminToken(req, res, next) {
  // Normalize token extraction and treat literal 'null'/'undefined' as missing
  const raw = req.headers.authorization;
  const token = raw && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ success: false, error: 'No token' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    // Log the underlying JWT error to help debugging (safe for dev environments)
    console.error('JWT verification failed:', err && err.message ? err.message : err);
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS || '4000', 10);
// Store data in memory
let cachedData = {
  round1: [],
  round2: [],
  lastUpdated: null
};
let isRefreshing = false;
let maxPanelsToDisplay = 3; // Default to 3 panels
let panelStatuses = {}; // Store panel live/break status: { "Panel Name": "live" | "break" }
let round2Enabled = false; // Toggle for Round 2 display
let round1Enabled = true; // Toggle for Round 1 display (default: enabled)
let processFlow = []; // Store the interview process flow steps

// API endpoint: Get filtered data
app.get('/api/data', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const filters = {
      statuses: req.query.statuses ? req.query.statuses.split(',') : ['ongoing', 'beready'],
      round: req.query.round || 'round1'
    };
    const data = filters.round === 'round1' ? cachedData.round1 : cachedData.round2;
    const processed = filterAndGroupData(data, filters);

    res.json({
      success: true,
      data: processed,
      lastUpdated: cachedData.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
async function refreshData() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    const result = await fetchAndParseSheets();
    cachedData = {
      round1: result.round1,
      round2: result.round2,
      lastUpdated: new Date()
    };
  } finally {
    isRefreshing = false;
  }
}


// API endpoint: Force refresh
app.post('/api/refresh', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await refreshData();

    res.json({
      success: true,
      message: 'Data refreshed successfully',
      lastUpdated: cachedData.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Background refresh
setInterval(async () => {
  try {
    await refreshData();
    process.stdout.write('.'); // heartbeat
  } catch (e) {
    console.error('\nBackground refresh failed:', e.message);
  }
}, REFRESH_INTERVAL_MS);
// Serve logo asset from project root
app.get('/logo.jpeg', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.jpeg'));
});

// Admin API: Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Admin API: Get config
app.get('/api/admin/config', verifyAdminToken, (req, res) => {
  res.json({
    success: true,
    config: {
      sheetId: process.env.GOOGLE_SHEET_ID || '1lpIbY3IzIOfGmIV0YLb7oC4uJ6GcBj_w0S8k8SBaAvY',
      refreshInterval: REFRESH_INTERVAL_MS
    }
  });
});

// Admin API: Update config
app.post('/api/admin/config', verifyAdminToken, (req, res) => {
  const { sheetId, refreshInterval } = req.body;
  if (!sheetId) return res.status(400).json({ success: false, error: 'Sheet ID required' });

  // In production, you'd persist this to a config file or database
  // For now, we just acknowledge it
  res.json({
    success: true,
    message: 'Config updated (requires server restart to take effect)',
    hint: 'Set GOOGLE_SHEET_ID and REFRESH_INTERVAL_MS environment variables'
  });
});

// Admin API: Get stats
app.get('/api/admin/stats', verifyAdminToken, (req, res) => {
  res.json({
    success: true,
    stats: {
      round1Count: cachedData.round1.length,
      round2Count: cachedData.round2.length,
      lastUpdated: cachedData.lastUpdated,
      maxPanels: maxPanelsToDisplay
    }
  });
});

// Admin API: Set panels count
app.post('/api/admin/panels-count', verifyAdminToken, (req, res) => {
  const { panelsCount } = req.body;
  if (!panelsCount || panelsCount < 1 || panelsCount > 10) {
    return res.status(400).json({ success: false, error: 'Invalid panels count (1-10)' });
  }
  maxPanelsToDisplay = panelsCount;
  res.json({ success: true, message: `Display set to ${panelsCount} panels` });
});

// Public API: Get max panels setting
app.get('/api/max-panels', (req, res) => {
  res.json({ maxPanels: maxPanelsToDisplay });
});

// Admin API: Get all panel statuses
app.get('/api/admin/panel-statuses', verifyAdminToken, (req, res) => {
  res.json({ success: true, statuses: panelStatuses });
});

// Admin API: Update panel status (Live/Break)
app.post('/api/admin/panel-status', verifyAdminToken, (req, res) => {
  const { panelName, status } = req.body;
  if (!panelName || !['live', 'break'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid panel name or status' });
  }
  panelStatuses[panelName] = status;
  res.json({ success: true, message: `Panel "${panelName}" set to ${status}` });
});

// Public API: Get panel statuses
app.get('/api/panel-statuses', (req, res) => {
  res.json({ statuses: panelStatuses });
});

// Admin API: Get Round 2 enabled status
app.get('/api/admin/round2-status', verifyAdminToken, (req, res) => {
  res.json({ success: true, round2Enabled });
});

// Admin API: Toggle Round 2
app.post('/api/admin/round2-toggle', verifyAdminToken, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be boolean' });
  }
  round2Enabled = enabled;
  res.json({ success: true, message: 'Round 2 ' + (enabled ? 'enabled' : 'disabled'), round2Enabled });
});

// Public API: Get Round 2 enabled status
app.get('/api/round2-enabled', (req, res) => {
  res.json({ round2Enabled });
});

// Admin API: Get Round 1 enabled status
app.get('/api/admin/round1-status', verifyAdminToken, (req, res) => {
  res.json({ success: true, round1Enabled });
});

// Admin API: Toggle Round 1
app.post('/api/admin/round1-toggle', verifyAdminToken, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be boolean' });
  }
  round1Enabled = enabled;
  res.json({ success: true, message: 'Round 1 ' + (enabled ? 'enabled' : 'disabled'), round1Enabled });
});

// Public API: Get Round 1 enabled status
app.get('/api/round1-enabled', (req, res) => {
  res.json({ round1Enabled });
});

// Admin API: Get process flow
app.get('/api/admin/process-flow', verifyAdminToken, (req, res) => {
  res.json({ success: true, processFlow });
});

// Placement Report API
app.get('/api/placement-report', async (req, res) => {
  try {
    // Fetch Stats and Expected sheets
    const [statsData, expectedData] = await Promise.all([
      fetchSheetByName('Stats', PLACEMENT_SHEET_ID).catch(err => {
        console.error('Error fetching Stats sheet:', err);
        return [];
      }),
      fetchSheetByName('Expected', PLACEMENT_SHEET_ID).catch(err => {
        console.error('Error fetching Expected sheet:', err);
        return [];
      })
    ]);

    // Process Stats Data
    const placedStudents = statsData.filter(row =>
      row['Placement Status'] && row['Placement Status'].toLowerCase() === 'placed'
    );

    // Helper to parse CTC
    const parseCTC = (val) => {
      if (!val) return 0;
      const num = parseFloat(val.toString().replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    };

    const ctcs = placedStudents
      .map(row => parseCTC(row['Compensation (LPA)']))
      .filter(ctc => ctc > 0)
      .sort((a, b) => b - a); // Descending order

    // Calculate Metrics
    const totalPlaced = ctcs.length;
    const averageCTC = totalPlaced > 0 ? ctcs.reduce((a, b) => a + b, 0) / totalPlaced : 0;

    // Median
    let medianCTC = 0;
    if (totalPlaced > 0) {
      const mid = Math.floor(totalPlaced / 2);
      medianCTC = totalPlaced % 2 !== 0 ? ctcs[mid] : (ctcs[mid - 1] + ctcs[mid]) / 2;
    }

    // Top Percentiles
    const getTopAverage = (percent) => {
      if (totalPlaced === 0) return 0;
      const count = Math.ceil(totalPlaced * (percent / 100));
      const topCtcs = ctcs.slice(0, count);
      return topCtcs.reduce((a, b) => a + b, 0) / topCtcs.length;
    };

    const top10Avg = getTopAverage(10);
    const top25Avg = getTopAverage(25);

    // Demographics (Engineers vs Non-Engineers)
    // Considering all students in the stats sheet, or just placed? Usually demographics applies to the batch.
    // Let's use all students in the sheet for demographics to show batch composition, 
    // or placed students for placement composition. The prompt asks "percentage of engineers are placed", 
    // implying we might need total engineers vs placed engineers, OR just the ratio within the placed set.
    // "what percenteage of engineers are placed to what percentage of non engineers" -> This is slightly ambiguous.
    // It could mean: (Placed Engineers / Total Engineers) vs (Placed Non-Engineers / Total Non-Engineers)
    // OR: (Placed Engineers / Total Placed) vs (Placed Non-Engineers / Total Placed)
    // Given "Placement Report", usually it shows the composition of the placed batch OR the success rate.
    // Let's calculate both if possible, but for the dashboard "Engineers vs Non-Engineers" usually implies composition.
    // Let's go with Composition of Placed Students for now as it's safer for a "Report".

    const engineers = placedStudents.filter(row => row['Degree'] === 'B.Tech').length;
    const nonEngineers = placedStudents.filter(row => row['Degree'] !== 'B.Tech').length;

    // Work Experience
    // "blank values should be treated as 0s"
    // We can calculate average work ex for placed students
    const workExs = placedStudents.map(row => {
      const val = row['WorkEx'];
      return (!val || val.trim() === '') ? 0 : parseFloat(val) || 0;
    });
    const avgWorkEx = workExs.length > 0 ? workExs.reduce((a, b) => a + b, 0) / workExs.length : 0;

    const freshersCount = workExs.filter(ex => ex === 0).length;
    const experiencedCount = workExs.filter(ex => ex > 0).length;

    // Detailed Student List for Modal
    const students = placedStudents.map(row => ({
      name: row['Name'],
      company: row['Company Name'],
      ctc: parseCTC(row['Compensation (LPA)']),
      degree: row['Degree'],
      workEx: row['WorkEx']
    })).sort((a, b) => b.ctc - a.ctc); // Sort by CTC descending

    res.json({
      success: true,
      metrics: {
        averageCTC,
        medianCTC,
        top10Avg,
        top25Avg,
        totalPlaced,
        demographics: {
          engineers,
          nonEngineers,
          total: engineers + nonEngineers
        },
        avgWorkEx,
        workEx: {
          freshers: freshersCount,
          experienced: experiencedCount
        }
      },
      expected: expectedData,
      students: students // Send detailed list
    });

  } catch (error) {
    console.error('Placement report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin API: Set process flow
app.post('/api/admin/process-flow', verifyAdminToken, (req, res) => {
  const { steps } = req.body;
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ success: false, error: 'steps must be non-empty array' });
  }
  processFlow = steps;
  res.json({ success: true, message: 'Process flow updated', processFlow });
});

// Public API: Get process flow
app.get('/api/process-flow', (req, res) => {
  res.json({ processFlow });
});

// Company Logo Management
let companyLogoUrl = '/logo.jpeg'; // Default logo

// Admin API: Set company logo
app.post('/api/admin/logo', verifyAdminToken, (req, res) => {
  const { logoUrl } = req.body;
  if (!logoUrl || typeof logoUrl !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid logo URL' });
  }
  companyLogoUrl = logoUrl;
  res.json({ success: true, message: 'Company logo updated', logoUrl: companyLogoUrl });
});

// Public API: Get company logo
app.get('/api/logo', (req, res) => {
  res.json({ logoUrl: companyLogoUrl });
});

// Company Name Management
let companyName = 'Company'; // Default name

// Admin API: Set company name
app.post('/api/admin/company-name', verifyAdminToken, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid company name' });
  }
  companyName = name;
  res.json({ success: true, message: 'Company name updated', companyName });
});

// Public API: Get company name
app.get('/api/company-name', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ companyName });
});

// Serve logo asset from project root
app.get('/logo.jpeg', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logo.jpeg'));
});

// Initialize data on startup
async function initializeData() {
  try {
    console.log('Fetching initial data from Google Sheets...');
    await refreshData();
    console.log(`✓ Loaded ${cachedData.round1.length} Round 1 records`);
    console.log(`✓ Loaded ${cachedData.round2.length} Round 2 records`);
  } catch (error) {
    console.error('Failed to initialize data:', error.message);
    process.exit(1);
  }
}
async function refreshData() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    const result = await fetchAndParseSheets();
    cachedData = {
      round1: result.round1,
      round2: result.round2,
      lastUpdated: new Date()
    };
  } finally {
    isRefreshing = false;
  }
}

// Start server
app.listen(PORT, async () => {
  await initializeData();
  // Background refresh starts after init
  setInterval(async () => {
    try {
      await refreshData();
      process.stdout.write('.'); // heartbeat
    } catch (e) {
      console.error('\nBackground refresh failed:', e.message);
    }
  }, REFRESH_INTERVAL_MS);
  console.log(`\n🚀 Interview Panel Tracker running on http://localhost:${PORT}\n`);
});
