// Browser talks to the API directly. Default suits the docker-compose port map;
// override at build time with NEXT_PUBLIC_API_URL if the API lives elsewhere.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
