import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ngrok 등 localhost 외 출처에서 dev 서버 자산/엔드포인트에 접근할 수 있도록 허용.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8080/api/:path*",
      },
    ];
  },
};

export default nextConfig;
