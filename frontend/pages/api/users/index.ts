import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/db';
import { PrismaClient } from '@prisma/client';

// Function to test database connection
async function testConnection() {
  console.log('Testing direct database connection...');
  const testClient = new PrismaClient();
  try {
    await testClient.$connect();
    console.log('Direct connection test successful');
    const count = await testClient.user.count();
    console.log('User count:', count);
    await testClient.$disconnect();
    return { success: true };
  } catch (error) {
    console.error('Direct connection test failed:', error);
    try {
      await testClient.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    return { success: false, error };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Log request information
  console.log(`[API] User ${req.method} request received at ${new Date().toISOString()}`);
  console.log(`[API] Request headers:`, req.headers['content-type']);
  
  try {
    // First, test direct connection
    const connectionTest = await testConnection();
    if (!connectionTest.success) {
      return res.status(503).json({
        error: 'Database connection failed',
        details: 'Unable to establish a direct connection to the database',
        test: connectionTest
      });
    }
    
    switch (req.method) {
      case 'GET':
        // Get all users
        const users = await prisma.user.findMany({
          select: {
            id: true,
            name: true,
            walletAddress: true,
            createdAt: true,
            _count: {
              select: {
                tenders: true,
                bids: true,
              },
            },
          },
        });

        return res.status(200).json(users);

      case 'POST':
        // Create or authenticate a user with wallet address
        const { walletAddress, name, email } = req.body;

        console.log('Received user data:', { walletAddress, name, email });

        if (!walletAddress) {
          console.error('Missing wallet address in request');
          return res.status(400).json({ error: 'Wallet address is required' });
        }
        
        // Ensure wallet address is properly formatted
        const formattedWalletAddress = String(walletAddress).toLowerCase();
        console.log('Formatted wallet address:', formattedWalletAddress);

        try {
          // Verify database connection before proceeding
          await prisma.$queryRaw`SELECT 1`;
          console.log('Database connection verified');
          
          // Check if user exists
          const existingUser = await prisma.user.findUnique({
            where: { walletAddress: formattedWalletAddress },
          });

          console.log('Existing user check result:', existingUser);

          if (existingUser) {
            // User exists, return the user data
            console.log('User found, returning existing user:', existingUser);
            return res.status(200).json(existingUser);
          }

          // Create a new user
          console.log('Creating new user with wallet address:', formattedWalletAddress);
          const newUser = await prisma.user.create({
            data: {
              walletAddress: formattedWalletAddress,
              name: name || `User-${formattedWalletAddress.substring(0, 8)}`,
            },
          });

          console.log('New user created:', newUser);
          return res.status(201).json(newUser);
        } catch (dbError: any) {
          console.error('Database operation failed:', dbError);
          
          // Special handling for database connection issues
          if (dbError.message.includes('connect') || dbError.code === 'P1001') {
            return res.status(503).json({ 
              error: 'Database connection failed', 
              details: 'Unable to connect to the database. Please check your connection string and try again.',
              code: dbError.code
            });
          }
          
          // Special handling for unique constraint violations
          if (dbError.code === 'P2002') {
            return res.status(409).json({ 
              error: 'Conflict with existing record', 
              details: `A user with this ${dbError.meta?.target || 'credential'} already exists.`,
              code: dbError.code
            });
          }
          
          return res.status(500).json({ 
            error: 'Database operation failed', 
            details: dbError.message,
            code: dbError.code
          });
        }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('Request error', error);
    res.status(500).json({ 
      error: 'Error processing your request', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 