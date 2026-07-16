import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next.js 16 clones request bodies before proxy execution and defaults to
    // 10 MB. Upload routes accept videos up to the application limit below.
    proxyClientMaxBodySize: "500mb",
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
