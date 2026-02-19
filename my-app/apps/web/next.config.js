/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Configure rewrites to proxy API requests to the backend
  // This allows the frontend to call /api/* and have it forwarded to the backend
  async rewrites() {
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${apiUrl}/api/:path*`,
        },
      ],
    };
  },

  // Ensure environment variables are available
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/auth',
  },
};

export default nextConfig;