
// App with draw, export image, chart.js, dark mode
let plzData = [];
let plzDataLoaded = false;
let lastSearchResults = [];
let markersLayer = L.markerClusterGroup();
let drawnItems = new L.FeatureGroup();
let heatLayer = null;
let circle = null;
let darkMode = false;
let zipChart = null;

let baseTiles = {
  light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    attribution: '&copy; CartoDB'
  })
};

const map = L.map('map', {
  center: [51.1657, 10.4515],
  zoom: 6,
  layers: [baseTiles.light]
});

map.addLayer(markersLayer);
map.addLayer(drawnItems);

// Controls
map.addControl(L.control.locate());
L.Control.geocoder().addTo(map);

const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: { polygon: true, rectangle: true, circle: false, marker: false, polyline: false }
});
map.addControl(drawControl);

fetch('data/plz_data.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        plzData = results.data.map(row => ({
          plz: row.plz?.padStart(5, '0'),
          lat: parseFloat(row.lat),
          lon: parseFloat(row.lon)
        })).filter(r => r.plz && !isNaN(r.lat) && !isNaN(r.lon));
        plzDataLoaded = true;
        console.log("Auto-loaded CSV with", plzData.length, "entries");
      }
    });
  });



// BLOCK 1: haversine()
// Purpose: This function handles haversine logic.
// --- START BLOCK 1: haversine ---
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
// --- END BLOCK 1 ---


// BLOCK 2: runSearch()
// Purpose: This function handles runSearch logic.
// --- START BLOCK 2: runSearch ---
function runSearch(lat, lon) {
  const radius = parseFloat(document.getElementById('radius').value);
  document.getElementById('radiusLabel').innerText = `Radius: ${radius} km`;

  if (circle) map.removeLayer(circle);
  if (heatLayer) map.removeLayer(heatLayer);
  markersLayer.clearLayers();

  circle = L.circle([lat, lon], {
    radius: radius * 1000,
    color: 'blue',
    fillColor: '#add8e6',
    fillOpacity: 0.3
  }).addTo(map);

  const result = plzData.filter(p => haversine(lat, lon, p.lat, p.lon) <= radius);
  lastSearchResults = result;
  updateMarkersAndTable(result, lat, lon);
  drawChart(result, lat, lon);
  map.fitBounds(circle.getBounds());
}
// --- END BLOCK 2 ---




// BLOCK 3: updateMarkersAndTable()
// Purpose: Updates map markers and renders ZIP list + prefix tree with full checkbox sync.
// --- START BLOCK 3: updateMarkersAndTable ---
function updateMarkersAndTable(list, lat, lon) {
  markersLayer.clearLayers();

  const icon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconSize: [20, 30],
    iconAnchor: [10, 30],
    popupAnchor: [1, -30]
  });

  list.forEach(p => {
    const dist = haversine(lat, lon, p.lat, p.lon).toFixed(2);
    const marker = L.marker([p.lat, p.lon], { icon }).bindTooltip(`${p.plz} (${dist} km)`);
    markersLayer.addLayer(marker);
  });

  heatLayer = L.heatLayer(list.map(p => [p.lat, p.lon, 0.8]), { radius: 20 }).addTo(map);

const zipListHTML = list
  .map(p => {
    const dist = haversine(lat, lon, p.lat, p.lon);
    return { ...p, dist };
  })
  .sort((a, b) => a.dist - b.dist) // ✅ Sort by distance ascending
  .map(p => {
  const routeLink = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${p.lat},${p.lon}`;
  return `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div>
        <input type="checkbox" class="form-check-input me-1 plzCheck" data-plz="${p.plz}" checked>
        <label>${p.plz}</label>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <span class="badge bg-secondary">${p.dist.toFixed(1)} km</span>
        <a href="${routeLink}" target="_blank" title="Open driving route"><span style="font-size: 1.2em;">Route</span></a>
      </div>
    </div>`;
}).join("");

  const grouped = {};
  list.forEach(r => {
    const levels = [r.plz.slice(0, 1), r.plz.slice(0, 2), r.plz.slice(0, 3), r.plz.slice(0, 4), r.plz];
    let pointer = grouped;
    levels.forEach((key, i) => {
      if (!pointer[key]) pointer[key] = i === 4 ? [] : {};
      pointer = pointer[key];
    });
    pointer.push(r);
  });

  function renderGroup(obj, level = 0, parentPrefix = '') {
    let html = '';
    for (const key in obj) {
      const fullPrefix = parentPrefix + key;
      if (Array.isArray(obj[key])) {
        html += `<div style='margin-left: ${level}rem'>
          <label><input type='checkbox' class='prefixCheck' data-prefix='${fullPrefix}' checked> <strong>${key}</strong></label><br>
          ${obj[key].map(r => `<label><input type='checkbox' class='plzCheck' data-plz='${r.plz}' checked> ${r.plz}</label>`).join('<br>')}
        </div>`;
      } else {
        html += `<details style='margin-left: ${level}rem'><summary>
          <label><input type='checkbox' class='prefixCheck' data-prefix='${fullPrefix}' checked> ${key}${'X'.repeat(4 - key.length)}</label>
        </summary>
        ${renderGroup(obj[key], level + 1, fullPrefix)}</details>`;
      }
    }
    return html;
  }

  document.getElementById('results').innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <div class="card p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong>${list.length} ZIPs found</strong>
            <button id="selectAllBtn" class="btn btn-sm btn-outline-secondary">Select All</button>
          </div>
          <div id="zipList" style="max-height: 320px; overflow-y: auto;">
            ${zipListHTML}
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card p-3">
          <strong>📂 ZIP Filter View</strong>
          <div style="max-height: 320px; overflow-y: auto;">
            ${renderGroup(grouped)}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    const boxes = document.querySelectorAll(".plzCheck");
    const allChecked = Array.from(boxes).every(cb => cb.checked);
    boxes.forEach(cb => cb.checked = !allChecked);
  });

  // ✅ FIXED checkbox sync for prefix groups
  document.querySelectorAll('.prefixCheck').forEach(groupCB => {
    groupCB.addEventListener('change', () => {
      const prefix = groupCB.dataset.prefix;

      // Uncheck/check all child ZIP checkboxes
      document.querySelectorAll(`.plzCheck[data-plz^='${prefix}']`).forEach(cb => {
        cb.checked = groupCB.checked;
      });

      // Also cascade to all nested .prefixCheck children
      document.querySelectorAll(`.prefixCheck[data-prefix^='${prefix}']`).forEach(child => {
        child.checked = groupCB.checked;
      });

      // Refresh visuals
      if (typeof updateVisualSelectionState === 'function') {
        updateVisualSelectionState();
      }
    });
  });
}
// --- END BLOCK 3 ---


map.on('click', e => {
  if (!plzDataLoaded) return;
  const closest = plzData.reduce((acc, p) => {
    const d = haversine(e.latlng.lat, e.latlng.lng, p.lat, p.lon);
    return d < acc.dist ? { ...p, dist: d } : acc;
  }, { dist: Infinity });

  if (closest && closest.plz) {
    document.getElementById('zip').value = closest.plz;
    runSearch(closest.lat, closest.lon);
  }
});


map.on('geosearch/showlocation', function(result) {
  if (!plzDataLoaded || !result || !result.location) return;

  const { y: lat, x: lon } = result.location;
  const closest = plzData.reduce((acc, p) => {
    const d = haversine(lat, lon, p.lat, p.lon);
    return d < acc.dist ? { ...p, dist: d } : acc;
  }, { dist: Infinity });

  if (closest && closest.plz) {
    document.getElementById('zip').value = closest.plz;
    runSearch(closest.lat, closest.lon);
  }
});

map.on(L.Draw.Event.CREATED, function (e) {
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);
  const shape = e.layer.toGeoJSON();
  const inside = plzData.filter(p =>
    turf.booleanPointInPolygon(turf.point([p.lon, p.lat]), shape)
  );
  lastSearchResults = inside;
  updateMarkersAndTable(inside, e.layer.getBounds().getCenter().lat, e.layer.getBounds().getCenter().lng);
  drawChart(inside, e.layer.getBounds().getCenter().lat, e.layer.getBounds().getCenter().lng);
});

document.getElementById('searchBtn').addEventListener('click', () => {
  const zip = document.getElementById('zip').value.trim();
  const found = plzData.find(p => p.plz === zip);
  if (!found) return alert('ZIP not found');
  runSearch(found.lat, found.lon);
});

document.getElementById('darkModeToggle').addEventListener('change', function () {
  darkMode = !darkMode;
  map.removeLayer(darkMode ? baseTiles.light : baseTiles.dark);
  map.addLayer(darkMode ? baseTiles.dark : baseTiles.light);
});

document.getElementById('downloadMap').addEventListener('click', () => {
  html2canvas(document.getElementById('map')).then(canvas => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'map_snapshot.png';
    a.click();
  });
});


// BLOCK 4: drawChart()
// Purpose: This function handles drawChart logic.
// --- START BLOCK 4: drawChart ---
function drawChart(list, lat, lon) {
  const buckets = [0, 5, 10, 20, 30, 50, 100];
  const counts = new Array(buckets.length - 1).fill(0);

  list.forEach(p => {
    const d = haversine(lat, lon, p.lat, p.lon);
    for (let i = 0; i < buckets.length - 1; i++) {
      if (d >= buckets[i] && d < buckets[i + 1]) {
        counts[i]++;
        break;
      }
    }
  });

  const ctx = document.getElementById('zipChart').getContext('2d');
  document.getElementById('chartContainer').classList.remove('d-none');
  if (zipChart) zipChart.destroy();

  zipChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: buckets.slice(0, -1).map((v, i) => `${v}-${buckets[i + 1]} km`),
      datasets: [{
        label: '# of ZIPs',
        data: counts,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}
// --- END BLOCK 4 ---

// BLOCK 5: exportFilteredData()
// Purpose: This function handles exportFilteredData logic.
// --- START BLOCK 5: exportFilteredData ---
function exportFilteredData(type) {
  const prefixes = document.getElementById('prefixFilter').value.split(',').map(p => p.trim()).filter(Boolean);
  const allCheckboxes = document.querySelectorAll('.plzCheck');
  const selected = Array.from(allCheckboxes).filter(cb => cb.checked).map(cb => cb.dataset.plz);

  const baseList = prefixes.length > 0
    ? plzData.filter(r => prefixes.some(p => r.plz.startsWith(p)))
    : lastSearchResults;

  const filtered = baseList.filter(r => selected.includes(r.plz));
  if (!filtered.length) return alert('No ZIPs matched.');

  // Group ZIPs hierarchically with parent checkboxes
  const grouped = {};
  filtered.forEach(r => {
    const levels = [r.plz.slice(0, 1), r.plz.slice(0, 2), r.plz.slice(0, 3), r.plz.slice(0, 4), r.plz];
    let pointer = grouped;
    levels.forEach((key, i) => {
      if (!pointer[key]) pointer[key] = i === 4 ? [] : {};
      pointer = pointer[key];
    });
    pointer.push(r);
  });

// --- END BLOCK 5 ---

// BLOCK 6: renderGroup()
// Purpose: This function handles renderGroup logic.
// --- START BLOCK 6: renderGroup ---
  function renderGroup(obj, level = 0, parentPrefix = '') {
    let html = '';
    for (const key in obj) {
      const fullPrefix = parentPrefix + key;
      if (Array.isArray(obj[key])) {
        html += `<div style='margin-left: ${level}rem'>
          <label><input type='checkbox' class='prefixCheck' data-prefix='${fullPrefix}' checked> <strong>${key}</strong></label><br>
          ${obj[key].map(r => `<label><input type='checkbox' class='plzCheck' data-plz='${r.plz}' checked> ${r.plz}</label>`).join('<br>')}
        </div>`;
      } else {
        html += `<details style='margin-left: ${level}rem'><summary>
          <label><input type='checkbox' class='prefixCheck' data-prefix='${fullPrefix}' checked> ${key}${'X'.repeat(4 - key.length)}</label>
        </summary>
        ${renderGroup(obj[key], level + 1, fullPrefix)}</details>`;
      }
    }
    return html;
  }
// --- END BLOCK 6 ---

  document.getElementById('results').innerHTML = renderGroup(grouped);

  // Sync group checkboxes
  document.querySelectorAll('.prefixCheck').forEach(groupCB => {
    groupCB.addEventListener('change', () => {
      const prefix = groupCB.dataset.prefix;
      const allChildren = document.querySelectorAll(`.plzCheck[data-plz^='${prefix}']`);
      allChildren.forEach(cb => cb.checked = groupCB.checked);
    });
  });

  if (type === 'csv') {
    const content = 'zip,lat,lon\n' + filtered.map(r => `${r.plz},${r.lat},${r.lon}`).join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'zip_export_filtered.csv';
    link.click();
  }

  if (type === 'excel') {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ZIPs');
    XLSX.writeFile(wb, 'zip_export_filtered.xlsx');
  }

  if (type === 'txt') {
    const blob = new Blob([filtered.map(r => r.plz).join(',')], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'zip_export_filtered.txt';
    link.click();
  }
}



document.getElementById('exportCSV').addEventListener('click', () => exportFilteredData('csv'));
document.getElementById('exportExcel').addEventListener('click', () => exportFilteredData('excel'));
document.getElementById('exportTXT').addEventListener('click', () => exportFilteredData('txt'));

// BLOCK 7: exportSelectedZips()
// Purpose: Export selected ZIPs (from list and prefix tree) to CSV, Excel, or TXT.
// --- START BLOCK 7: exportSelectedZips ---
function exportSelectedZips(format) {
  const selectedZips = Array.from(document.querySelectorAll('.plzCheck:checked')).map(cb => cb.dataset.plz);
  const filtered = lastSearchResults.filter(r => selectedZips.includes(r.plz));
  if (!filtered.length) return alert("No ZIPs selected.");

  if (format === 'csv') {
    const csv = 'zip,lat,lon\n' + filtered.map(r => `${r.plz},${r.lat},${r.lon}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'zip_export_selected.csv';
    link.click();
  }

  if (format === 'excel') {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ZIPs');
    XLSX.writeFile(wb, 'zip_export_selected.xlsx');
  }

  if (format === 'txt') {
    const blob = new Blob([filtered.map(r => r.plz).join(',')], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'zip_export_selected.txt';
    link.click();
  }
}
// --- END BLOCK 7 ---

// Attach export buttons
document.getElementById('exportCSV')?.addEventListener('click', () => exportSelectedZips('csv'));
document.getElementById('exportExcel')?.addEventListener('click', () => exportSelectedZips('excel'));
document.getElementById('exportTXT')?.addEventListener('click', () => exportSelectedZips('txt'));




// BLOCK 8: updateVisualSelectionState()
// Purpose: Show selected ZIPs in orange, unselected within radius in gray, and outside-radius ZIPs in light gray.
// --- START BLOCK 8: updateVisualSelectionState ---
let selectedLayer = L.layerGroup().addTo(map);
let unselectedLayer = L.layerGroup().addTo(map);
let outsideLayer = L.layerGroup().addTo(map);

function updateVisualSelectionState() {
  selectedLayer.clearLayers();
  unselectedLayer.clearLayers();
  outsideLayer.clearLayers();

  const selectedZips = new Set([...document.querySelectorAll('.plzCheck:checked')].map(cb => cb.dataset.plz));
  const visibleZips = new Set(lastSearchResults.map(r => r.plz));

  // Selected ZIPs (orange)
  lastSearchResults.forEach(p => {
    const dist = haversine(map.getCenter().lat, map.getCenter().lng, p.lat, p.lon).toFixed(2);
    const isSelected = selectedZips.has(p.plz);
    const marker = isSelected
      ? L.circle([p.lat, p.lon], {
          radius: 500,
          fillColor: "#ffa200",
          color: "#e48b00",
          weight: 1,
          opacity: 0.9,
          fillOpacity: 0.3
        }).bindTooltip(`${p.plz} (${dist} km)`)
      : L.circle([p.lat, p.lon], {
          radius: 500,
          fillColor: "#cccccc",
          color: "#999999",
          weight: 1,
          opacity: 0.2,
          fillOpacity: 0.15
        }).bindTooltip(`${p.plz} (unselected)`);

    if (isSelected) {
      selectedLayer.addLayer(marker);
    } else {
      unselectedLayer.addLayer(marker);
    }
  });

  // Outside ZIPs (faint gray)
  plzData.forEach(p => {
    if (!visibleZips.has(p.plz)) {
      const marker = L.circle([p.lat, p.lon], {
        radius: 400,
        fillColor: "#eeeeee",
        color: "#cccccc",
        weight: 1,
        opacity: 0.2,
        fillOpacity: 0.1
      }).bindTooltip(`${p.plz} (outside radius)`);
      outsideLayer.addLayer(marker);
    }
  });
}

// Sync on checkbox change
document.addEventListener("change", e => {
  if (e.target.classList.contains("plzCheck")) {
    updateVisualSelectionState();
  }
});
// --- END BLOCK 8 ---




// BLOCK 10: ZIP Highlight Heatmap
// Purpose: Allows users to input ZIPs via text or CSV and highlight them on map via heatmap or circle markers
// --- START BLOCK 10: ZIP Highlight Heatmap ---

let highlightLayer = L.layerGroup().addTo(map);

// Handle text area input
document.getElementById('highlightBtn').addEventListener('click', () => {
  const raw = document.getElementById('zipInputArea').value;
  const zips = raw.split(',').map(z => z.trim()).filter(Boolean);

  applyZipHighlight(zips);
});

// Handle CSV file input
document.getElementById('zipFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const zips = results.data.map(r => r.plz?.toString().padStart(5, '0')).filter(Boolean);
      applyZipHighlight(zips);
    }
  });
});

// Main ZIP highlight handler
function applyZipHighlight(zipList) {
  highlightLayer.clearLayers();

 // STEP 1: Count ZIP frequencies
const zipFrequency = {};
zipList.forEach(z => {
  zipFrequency[z] = (zipFrequency[z] || 0) + 1;
});

// STEP 2: Find matches and scale intensity
const found = plzData.filter(p => zipFrequency[p.plz]);
if (!found.length) {
  alert("No ZIPs matched for heatmap.");
  return;
}

const heatData = found.map(p => [
  p.lat,
  p.lon,
  Math.min(zipFrequency[p.plz] * 0.3, 1.0)  // Limit intensity max = 1.0
]);

// STEP 3: Render the heatmap
L.heatLayer(heatData, {
  radius: 25,
  blur: 15,
  maxZoom: 12
}).addTo(highlightLayer);


  // Option 2: Circle markers (optional)
  found.forEach(p => {
    const marker = L.circle([p.lat, p.lon], {
      radius: 400,
      fillColor: "#ffa500",
      color: "#cc8400",
      weight: 1,
      fillOpacity: 0.4
    }).bindTooltip(p.plz);
    highlightLayer.addLayer(marker);
  });

  map.fitBounds(L.featureGroup(found.map(p => L.circle([p.lat, p.lon]))).getBounds());
}
// --- END BLOCK 10 ---




// BLOCK 11: Export Unmatched ZIPs from Heatmap Input (CSV, Excel, TXT)
// --- START BLOCK 11: Export Unmatched ZIPs from Heatmap Input ---
document.getElementById('exportUnmatchedBtn').addEventListener('click', () => {
  const raw = document.getElementById('zipInputArea').value;
  const zipsFromText = raw.split(',').map(z => z.trim()).filter(Boolean);

  const fileInput = document.getElementById('zipFileInput');
  if (fileInput.files.length > 0) {
    Papa.parse(fileInput.files[0], {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        const csvZips = results.data.map(r => r.plz?.toString().padStart(5, '0')).filter(Boolean);
        exportUnmatched(csvZips);
      }
    });
  } else {
    exportUnmatched(zipsFromText);
  }
});

function exportUnmatched(inputZips) {
  const inputSet = new Set(inputZips);
  const unmatched = plzData.filter(p => !inputSet.has(p.plz));
  if (!unmatched.length) return alert("All ZIPs were matched.");

  // Format CSV
  const csv = 'plz,lat,lon\n' + unmatched.map(p => `${p.plz},${p.lat},${p.lon}`).join('\n');
  downloadFile(csv, 'unmatched_zipcodes.csv', 'text/csv');

  // Format Excel
  const ws = XLSX.utils.json_to_sheet(unmatched);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unmatched ZIPs');
  XLSX.writeFile(wb, 'unmatched_zipcodes.xlsx');

  // Format TXT (ZIP only, comma-separated)
  const txt = unmatched.map(p => p.plz).join(',');
  downloadFile(txt, 'unmatched_zipcodes.txt', 'text/plain');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
// --- END BLOCK 11 ---
