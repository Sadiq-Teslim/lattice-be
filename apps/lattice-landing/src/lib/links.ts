export const links = {
  ogunDemo:
    process.env.NEXT_PUBLIC_OGUN_DEMO_URL ?? "http://localhost:3000/admin/ogun-education",
  workerDemo: process.env.NEXT_PUBLIC_WORKER_DEMO_URL ?? "http://localhost:3000/verify/demo",
  apiDocs: process.env.NEXT_PUBLIC_API_DOCS_URL ?? "https://lattice-be.onrender.com/docs",
  apiBase: "https://lattice-be.onrender.com/api/v1",
  github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/Sadiq-Teslim/lattice-be",
};
