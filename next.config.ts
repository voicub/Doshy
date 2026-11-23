import type { NextConfig } from 'next';

// R3F's reconciler logs "synchronously unmount a root" under React Strict Mode double-mounting in dev (harmless, absent in production).
const config: NextConfig = {
  turbopack: { root: __dirname },
  reactStrictMode: false,
  // `next dev` refuses cross-origin requests from other machines: list the LAN addresses you open it from in DOSHY_DEV_ORIGINS (comma separated, e.g. in .env.local).
  allowedDevOrigins: (process.env.DOSHY_DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // The Docker image sets HOUSEY_STANDALONE=1 to get a small self-contained server; `next dev` is unaffected.
  output: process.env.HOUSEY_STANDALONE ? 'standalone' : undefined,
};
export default config;
