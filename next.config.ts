import type {NextConfig} from 'next';

// We will remove next-transpile-modules

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/**', // Allow images from any bucket in this host
      },
    ],
  },
  allowedDevOrigins: [
    'http://localhost:3001'
  ],
  // Add the transpilePackages option here
  transpilePackages: [
    '@fullcalendar/common',
    '@fullcalendar/react',
    '@fullcalendar/daygrid',
    '@fullcalendar/interaction',
  ],
  experimental: { // <--- ADD THIS
    nodeMiddleware: true, // <--- AND THIS
  },
};

export default nextConfig;
