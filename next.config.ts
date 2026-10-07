import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The deployment opens straight into Greenhold. Temporary (307) redirects,
  // so browsers don't cache them for good; old EcoRise links land in the new game.
  async redirects() {
    return [
      { source: "/", destination: "/greenhold", permanent: false },
      { source: "/ecorise", destination: "/greenhold", permanent: false },
    ];
  },
};

export default nextConfig;
