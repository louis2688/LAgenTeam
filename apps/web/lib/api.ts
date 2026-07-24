// The browser calls the API through a same-origin Next proxy (app/api/[...path]/route.ts),
// which injects the server-side API token. No cross-origin request, no token in the browser.
export const API = "/api";