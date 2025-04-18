import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        const { tenderId } = req.query;
        const bids = await prisma.bid.findMany({
          where: tenderId ? {
            tenderId: tenderId as string
          } : undefined,
          include: {
            bidder: true,
            tender: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        return res.status(200).json(bids);

      case 'POST':
        const { amount, proposal, tenderId: bidTenderId, walletAddress } = req.body;

        if (!amount || !proposal || !bidTenderId || !walletAddress) {
          return res.status(400).json({
            error: 'Missing required fields',
            details: 'All fields (amount, proposal, tenderId, walletAddress) are required'
          });
        }

        try {
          // Get or create user based on wallet address
          const user = await prisma.user.upsert({
            where: { walletAddress },
            update: {}, // No updates needed if user exists
            create: {
              walletAddress,
            },
          });

          // Create the bid
          const newBid = await prisma.bid.create({
            data: {
              amount: parseFloat(amount.toString()),
              proposal,
              tender: {
                connect: { id: bidTenderId },
              },
              bidder: {
                connect: { id: user.id },
              },
            },
            include: {
              bidder: true,
              tender: true,
            },
          });

          return res.status(201).json(newBid);
        } catch (dbError: any) {
          console.error('Database error during bid creation:', dbError);
          return res.status(500).json({
            error: 'Database operation failed',
            details: dbError.message,
            code: dbError.code || 'UNKNOWN'
          });
        }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('Request error in bids API:', error);
    res.status(500).json({
      error: 'Error processing your request',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 