import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/': ['./app/studio.html']},
  serverExternalPackages: ['pg'],
};

export default nextConfig;
