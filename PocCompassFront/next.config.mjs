const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev artifacts separate from the production build (same as TomasFront / ContractToolFront):
  // sharing .next between `next dev` and `next build` crashes the dev server on this PC.
  distDir: isDev ? ".next-dev" : ".next",
  // App Service runs `node server.js` from the standalone bundle (see scripts/deploy.sh).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
