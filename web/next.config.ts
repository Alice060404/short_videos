import type { NextConfig } from "next";

// 静态导出：构建产物在 out/，与 PHP 接口（api/）放在同一站点根目录即可。
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
