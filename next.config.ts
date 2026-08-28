import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le service worker doit être servi depuis la racine avec le bon scope.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
