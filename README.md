# Interview Panel Tracker - Node.js Edition

A modern, real-time dashboard for tracking interview candidates across multiple panels, built with Node.js/Express and integrated with Google Sheets.

## Features

- 🎯 **Real-time Data**: Fetches candidate data directly from Google Sheets
- 📊 **Smart Filtering**: Filter by status (On-Going, Be Ready, Pending, Done)
- 🎨 **Beautiful UI**: Modern card-based layout with Tailwind CSS
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- 🚀 **Fast Performance**: Server-side data processing and caching
- 💡 **Smart Be Ready Detection**: Automatically marks the next candidate in line

## Installation

```bash
cd interview-tracker-nodejs
npm install
```

## Configuration

Copy the example environment file and adjust values:
```
cp .env.example .env
```

Then edit `.env` with your settings. You can set:
```
# Server port
PORT=3000

# Google Sheet ID (from the sheet URL)
GOOGLE_SHEET_ID=your_google_sheet_id_here
```

If `GOOGLE_SHEET_ID` is not set, the app will use a default sheet ID baked into the code.

### Live refresh
- Server refreshes Google Sheets data in the background every 15 seconds by default (configurable via `REFRESH_INTERVAL_MS`).
- Client polls the API every 10 seconds to update the UI automatically.

## Usage

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Project Structure

```
interview-tracker-nodejs/
├── server.js                 # Express server setup
├── public/
│   └── index.html           # Frontend dashboard
├── utils/
│   ├── sheetsFetcher.js     # Google Sheets CSV fetching
│   └── dataProcessor.js     # Data filtering and grouping
├── package.json             # Dependencies
└── .env                      # Environment variables
```

## API Endpoints

### GET /api/data
Fetch filtered interview data.

**Query Parameters:**
- `statuses` (comma-separated): ongoing, beready, pending, done
- `round` (default: round1): round1 or round2

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "panel": "Panel A",
      "items": [...],
      "ongoingCount": 2,
      "otherCount": 3
    }
  ],
  "lastUpdated": "2025-10-19T..."
}
```

### POST /api/refresh
Force a refresh of data from Google Sheets.

**Response:**
```json
{
  "success": true,
  "message": "Data refreshed successfully",
  "lastUpdated": "2025-10-19T..."
}
```

## Be Ready Logic

The "Be Ready" status is automatically assigned to:
- The immediate next candidate **after all ongoing candidates** in the same panel
- Only if at least one candidate is currently "On-Going"
- Only displayed if the "Be Ready" filter is active

Example:
- Panel A: On-Going (1) → **Be Ready (next person)** → Pending (3)
- Panel B: No On-Going → No Be Ready badge shown

## Technologies Used

- **Node.js** - Runtime
- **Express.js** - Web framework
- **Axios** - HTTP client
- **csv-parse** - CSV parsing
- **Tailwind CSS** - UI styling

## License

ISC
