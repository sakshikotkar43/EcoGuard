// Backend address. location.origin = "the same server that served this page" (right when Render hosts both).
// If the dashboard is hosted elsewhere (e.g. Vercel), put the full Render URL here instead, with no trailing slash.
// SOURCE: "cloud" = read ESP32 data via the backend, "sim" = start in simulation mode.
window.ECOGUARD = { API: location.origin, SOURCE: "cloud" };
