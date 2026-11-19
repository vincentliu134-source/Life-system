import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.LIFE_TEST_MODE === "1" ? ".next-lan-test" : ".next",
  allowedDevOrigins: process.env.LIFE_TEST_MODE === "1"
    ? ["127.0.0.1", process.env.LIFE_TEST_ORIGIN, process.env.LIFE_TEST_IP].filter((value): value is string => Boolean(value))
    : undefined,
  reactStrictMode: true,
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
