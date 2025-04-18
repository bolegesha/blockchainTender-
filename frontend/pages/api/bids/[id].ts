import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid bid ID' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get a specific bid by ID
        const bid = await prisma.bid.findUnique({
          where: { id },
          include: {
            tender: {
              select: {
                id: true,
                title: true,
                description: true,
                budget: true,
                deadline: true,
                status: true,
                creatorId: true,
              },
            },
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
        // Update a bid (amount, proposal or status)
        const { amount, proposal, status } = req.body;

        const updatedBid = await prisma.bid.update({
          where: { id },
          data: {
            ...(amount && { amount: parseFloat(amount) }),
            ...(proposal && { proposal }),
            ...(status && { status }),
          },
          include: {
            tender: {
              select: {
                id: true,
                title: true,
              },
            },
            bidder: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
          },
        });

        // If status is changed to ACCEPTED, update tender status to AWARDED
        if (status === 'ACCEPTED') {
          await prisma.tender.update({
            where: { id: updatedBid.tenderId },
            data: {
              status: 'AWARDED',
            },
          });

          // Set all other bids on this tender to REJECTED
          await prisma.bid.updateMany({
            where: {
              tenderId: updatedBid.tenderId,
              id: { not: id },
            },
            data: {
              status: 'REJECTED',
            },
          });
        }

        return res.status(200).json(updatedBid);

      case 'DELETE':
        // Delete a bid
        await prisma.bid.delete({
          where: { id },
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