/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard talks to the Express gateway. Default to localhost; override
  // with NEXT_PUBLIC_GATEWAY_URL for deployed environments.
  env: {
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080",
  },
};

export default nextConfig;
