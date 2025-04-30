import type {NextConfig} from 'next';

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
    ],
  },
  allowedDevOrigins: [
    'https://9003-idx-studio-1745947987104.cluster-ux5mmlia3zhhask7riihruxydo.cloudworkstations.dev',
    'http://9003-idx-studio-1745947987104.cluster-ux5mmlia3zhhask7riihruxydo.cloudworkstations.dev'
  ]
};

export default nextConfig;