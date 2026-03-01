import type {NextConfig} from 'next';

// We will remove next-transpile-modules

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
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
    'http://localhost:3001',
    'http://localhost:3000',
    'http://192.168.0.71:3001',
    'http://192.168.0.71:3000',
    'http://192.168.0.71'
  ],
  // Add the transpilePackages option here
  transpilePackages: [
    '@fullcalendar/common',
    '@fullcalendar/react',
    '@fullcalendar/daygrid',
    '@fullcalendar/interaction',
  ],
  // REMOVED experimental: { nodeMiddleware: true },
};

export default nextConfig;
