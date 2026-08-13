/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: __dirname },
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

module.exports = nextConfig;
