import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "z-ai-web-dev-sdk"],
  // A Vercel build must fail on type errors rather than hiding them.
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
