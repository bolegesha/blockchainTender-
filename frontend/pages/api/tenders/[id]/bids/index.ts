import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid tender ID' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get all bids for a specific tender
        const bids = await prisma.bid.findMany({
          where: { tenderId: id },
          include: {
            bidder: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
            documents: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return res.status(200).json(bids);

      case 'POST':
        // Create a new bid for a tender
        const { amount, proposal, bidderId } = req.body;

        // Validate required fields
        if (!amount || !proposal) {
          return res.status(400).json({ error: 'Please provide amount and proposal' });
        }

        // Check if the tender exists
        const tender = await prisma.tender.findUnique({
          where: { id },
        });

        if (!tender) {
          return res.status(404).json({ error: 'Tender not found' });
        }

        // Create a new bid
        const newBid = await prisma.bid.create({
          data: {
            amount: typeof amount === 'string' ? parseFloat(amount) : amount,
            proposal,
            status: 'PENDING',
            tender: { connect: { id } },
            bidder: { 
              connect: { 
                id: bidderId || 'mock-user' // Use a mock user ID if not provided
              } 
            },
          },
          include: {
            bidder: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
          },
        });

        return res.status(201).json(newBid);

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('Request error', error);
    res.status(500).json({ error: 'Error processing your request', details: error.message });
  }
} 