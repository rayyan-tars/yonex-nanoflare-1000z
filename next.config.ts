import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The hackathon deployment opens straight into EcoRise. Temporary (307), so
  // browsers don't cache it for good and the old root page can come back later.
  async redirects() {
    return [{ source: "/", destination: "/ecorise", permanent: false }];
  },
};

export default nextConfig;
