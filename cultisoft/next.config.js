/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["postgres"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ibkhvopshhlbvjwrmuzm.supabase.co" },
    ],
  },
};

module.exports = nextConfig;
