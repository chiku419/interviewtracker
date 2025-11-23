function normalizeStatus(status) {
  if (!status) return '';
  return String(status)
    .toLowerCase()
    .trim()
    .replace(/\s/g, '')
    .replace(/-/g, '');
}

function getPanelKey(row) {
  return (
    row['Round 1 Panel'] ||
    row['Round1 Panel'] ||
    row['Round1Panel'] ||
    row['Round 2 Panel'] ||
    row['Round2 Panel'] ||
    row['Round2Panel'] ||
    row['Panelist Name - Room'] || // Round 2 sheet column
    row['Panel'] || // Fallback for generic 'Panel' column
    row['panel']
  );
}

function getNameFromEmail(email) {
  if (!email || typeof email !== 'string') return 'Unknown';
  const name = email.split('@')[0] || '';
  return name
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function filterAndGroupData(data, filters) {
  const { statuses, round } = filters;
  const activeStatuses = new Set(statuses.map(s => normalizeStatus(s)));

  // Group by panel
  const groups = new Map();
  for (const row of data) {
    const panel = getPanelKey(row);
    if (!panel || !panel.trim()) continue;

    const panelName = panel.trim();
    if (!groups.has(panelName)) {
      groups.set(panelName, []);
    }
    groups.get(panelName).push(row);
  }

  // Process each panel
  const result = [];
  const panels = Array.from(groups.keys()).sort();

  for (const panel of panels) {
    const panelRows = groups.get(panel) || [];

    // Compute indices to preserve original order
    const ongoingIdxs = [];
    for (let i = 0; i < panelRows.length; i++) {
      if (normalizeStatus(panelRows[i]['Status']) === 'ongoing') ongoingIdxs.push(i);
    }
    const hasOngoing = ongoingIdxs.length > 0;
    const lastOngoingIdx = hasOngoing ? Math.max(...ongoingIdxs) : -1;
    const beReadyIdx = hasOngoing ? lastOngoingIdx + 1 : -1;
    const beReadyRow = hasOngoing && beReadyIdx < panelRows.length ? panelRows[beReadyIdx] : null;

    // Build display list
    let display = [];

    // Add ongoing if filter is active
    if (activeStatuses.has('ongoing')) {
      for (const idx of ongoingIdxs) display.push(panelRows[idx]);
    }

    // Insert Be Ready row right after ongoing items if applicable
    let includedBeReady = false;
    // All interviews over if there is at least one ongoing and no next candidate in this panel
    // OR if there are no ongoing candidates but there are records in the panel (all completed)
    let allOver = (hasOngoing && !beReadyRow) || (panelRows.length > 0 && !hasOngoing);
    if (activeStatuses.has('beready') && hasOngoing) {
      if (beReadyRow) {
        const ongoingInDisplay = display.filter(r => normalizeStatus(r['Status']) === 'ongoing').length;
        display.splice(ongoingInDisplay, 0, beReadyRow);
        includedBeReady = true;
      }
    }

    // Add other items if their status is active (avoid duplicating the Be Ready row)
    for (let i = 0; i < panelRows.length; i++) {
      const item = panelRows[i];
      let status = normalizeStatus(item['Status']);
      if (status === '') status = 'pending'; // Treat empty status as pending

      const isOngoing = status === 'ongoing';
      const isBeReadyRow = beReadyRow ? item === beReadyRow : false;
      if (!isOngoing && !isBeReadyRow && activeStatuses.has(status)) {
        display.push(item);
      }
    }

    if (display.length === 0) {
      // Only show panel if all interviews are over
      if (!allOver) continue;
      // If allOver, we'll show an empty panel with the message
    }

    // Mark Be Ready: first non-ongoing item if there are ongoing items
    const displayWithBeReady = display.map((item, index) => {
      const status = normalizeStatus(item['Status']);
      const ongoingCount = display.filter(r => normalizeStatus(r['Status']) === 'ongoing').length;

      let displayStatus = item['Status'];
      let showAsBeReady = false;

      // First non-ongoing item (the inserted beReadyRow) is "Be Ready" if there are ongoing items
      if (status !== 'ongoing' && index === ongoingCount && ongoingCount > 0 && activeStatuses.has('beready')) {
        displayStatus = 'Be Ready';
        showAsBeReady = true;
      }

      return {
        ...item,
        displayStatus,
        showAsBeReady,
        name: item['Name'] || getNameFromEmail(item['Email']),
        normalizedStatus: normalizeStatus(item['Status'])
      };
    });

    result.push({
      panel,
      items: displayWithBeReady,
      ongoingCount: displayWithBeReady.filter(r => r.normalizedStatus === 'ongoing').length,
      otherCount: displayWithBeReady.filter(r => r.normalizedStatus !== 'ongoing').length,
      allOver
    });
  }

  return result;
}

module.exports = {
  normalizeStatus,
  getPanelKey,
  getNameFromEmail,
  filterAndGroupData
};
