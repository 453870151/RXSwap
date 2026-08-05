/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deployed as a standard Next.js Node server (supports future API routes /
  // server actions), NOT a static export. Do NOT re-add `output: "export"` —
  // it forbids server-side features and would block the planned API later.
  //
  // Images are rendered as plain CSS token logos (no next/image), so the
  // optimizer is disabled to keep builds dependency-light. Safe in both dev
  // and a Node server deployment.
  images: { unoptimized: true },
  eslint: {
    // ESLint is not part of the dependency set; skip it during builds.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
