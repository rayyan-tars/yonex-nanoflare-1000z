import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deployment opens straight into Greenhold. Temporary (307) redirects,
  // so browsers don't cache them for good; older game links land here too.
  async redirects() {
    return [
      { source: "/", destination: "/greenhold", permanent: false },
      { source: "/ecorise", destination: "/greenhold", permanent: false },
      { source: "/clear-skies", destination: "/greenhold", permanent: false },
    ];
  },
};

export default nextConfig;
