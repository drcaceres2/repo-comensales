import type {NextConfig} from 'next';

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
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
  // allowedDevOrigins: [  // REMOVED THIS LINE
  //   'http://localhost:3001'
  // ],
  transpilePackages: [
    '@fullcalendar/common',
    '@fullcalendar/react',
    '@fullcalendar/daygrid',
    '@fullcalendar/interaction',
  ],

  // Ensure the ENTIRE webpack function below is commented out or deleted
  /*
  webpack: (config, { isServer, nextRuntime, webpack }) => {
    // Log to see when this webpack config is run and for what runtime
    console.log(`Custom Webpack config: isServer=${isServer}, nextRuntime='${nextRuntime}' for context: ${config.context}`);

    if (nextRuntime === 'nodejs' || nextRuntime === 'edge') {
      console.log(`Applying Node.js/Edge externals and alias for ${nextRuntime} runtime.`);

      config.resolve = config.resolve || {};
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.alias['node:process'] = 'process';
      config.resolve.alias['node:events'] = 'events'; 

      if (!Array.isArray(config.externals)) {
        config.externals = [];
      }
      config.externals.unshift(({ request, context, getResolve }, callback: (error?: Error | null, result?: string) => void) => {
        if (request && request.startsWith('node:')) {
          return callback(null, 'commonjs ' + request.substring(5));
        }
        if (request === 'process' || request === 'events') { 
             return callback(null, 'commonjs ' + request);
        }
        callback();
      });
    }

    if (!isServer && (nextRuntime === undefined || nextRuntime === '')) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "fs": false,
        "net": false,
        "tls": false,
        "child_process": false,
        "stream": false,
        "util": false,
      };
    }

    return config;
  },
  */
};

export default nextConfig;
