# depostleitzahl

A simple web application for searching German postal codes (PLZ) and visualizing results on an interactive Leaflet map.

## Running the App

This project is entirely client side. To avoid browser restrictions when loading the CSV data, serve the files via a local web server and then open `index.html` in your browser.

One quick method using Node.js:

```bash
npx http-server
```

Then navigate to the printed local address in your browser.

## Dependencies

All JavaScript libraries are included through CDN links in `index.html` (Leaflet, MarkerCluster, Heatmap, LocateControl, Leaflet Draw, Chart.js, PapaParse, XLSX and Bootstrap). Only a simple HTTP server is required when running locally.
