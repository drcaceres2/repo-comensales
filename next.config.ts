import type {NextConfig} from 'next';

import withTM from 'next-transpile-modules';

const withTranspileModules = withTM([
  '@fullcalendar/common',
  '@fullcalendar/react',
  '@fullcalendar/daygrid',
  '@fullcalendar/interaction',
]);

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false, // Added this line
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
    'http://localhost:3000'
  ]
};

export default nextConfig;