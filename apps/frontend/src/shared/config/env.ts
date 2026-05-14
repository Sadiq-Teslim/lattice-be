const productionApiUrl = "https://lattice-be.onrender.com/api/v1";
const productionAppUrl = "https://lattice-be.vercel.app";

function defaultApiUrl() {
  if (typeof window === "undefined") return productionApiUrl;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8010/api/v1"
    : productionApiUrl;
}

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl(),
  publicAppUrl: process.env.NEXT_PUBLIC_PUBLIC_APP_URL ?? productionAppUrl,
  latticeApiKey: process.env.NEXT_PUBLIC_LATTICE_API_KEY ?? "lt_live_235679",
};
