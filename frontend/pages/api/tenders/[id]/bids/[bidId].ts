import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id, bidId } = req.query;
  
  if (!id || typeof id !== 'string' || !bidId || typeof bidId !== 'string') {
    return res.status(400).json({ error: 'Invalid tender ID or bid ID' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get a specific bid
        const bid = await prisma.bid.findFirst({
          where: { 
            id: bidId,
            tenderId: id 
          },
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
        });

        if (!bid) {
          return res.status(404).json({ error: 'Bid not found' });
        }

        return res.status(200).json(bid);

      case 'PUT':
        // Update a bid
        const { amount, proposal, status } = req.body;

        // Validate the request
        if (!amount && !proposal && !status) {
          return res.status(400).json({ error: 'No fields provided for update' });
        }

        // Check if the bid exists
        const existingBid = await prisma.bid.findFirst({
          where: { 
            id: bidId,
            tenderId: id 
          },
        });

        if (!existingBid) {
          return res.status(404).json({ error: 'Bid not found' });
        }

        // Update the bid
        const updatedBid = await prisma.bid.update({
          where: { id: bidId },
          data: {
            ...(amount && { amount: typeof amount === 'string' ? parseFloat(amount) : amount }),
            ...(proposal && { proposal }),
            ...(status && { status }),
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

        return res.status(200).json(updatedBid);

      case 'DELETE':
        // Delete a bid
        await prisma.bid.delete({
          where: { id: bidId },
        });

        return res.status(204).end();

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('Request error', error);
    res.status(500).json({ error: 'Error processing your request', details: error.message });
  }
} 