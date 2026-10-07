import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deployment opens straight into Clear Skies. Temporary (307) redirects,
  // so browsers don't cache them for good; older game links land here too.
  async redirects() {
    return [
      { source: "/", destination: "/clear-skies", permanent: false },
      { source: "/ecorise", destination: "/clear-skies", permanent: false },
      { source: "/greenhold", destination: "/clear-skies", permanent: false },
    ];
  },
};

export default nextConfig;
