import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react", "radix-ui", "sonner", "class-variance-authority"],
  },
};

export default nextConfig;
