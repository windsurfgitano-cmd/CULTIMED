/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["postgres"],
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "ibkhvopshhlbvjwrmuzm.supabase.co" },
      { protocol: "https", hostname: "api.qrserver.com" },
    ],
  },
};

module.exports = nextConfig;
