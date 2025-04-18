import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/db';

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
        // Get a specific tender by ID
        const tender = await prisma.tender.findUnique({
          where: { id },
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
            categories: true,
            bids: {
              include: {
                bidder: {
                  select: {
                    id: true,
                    name: true,
                    walletAddress: true,
                  },
                },
              },
            },
            documents: true,
          },
        });

        if (!tender) {
          return res.status(404).json({ error: 'Tender not found' });
        }

        return res.status(200).json(tender);

      case 'PUT':
        // Update a tender
        const { title, description, budget, deadline, status, categories } = req.body;

        // Update tender with new values
        const updatedTender = await prisma.tender.update({
          where: { id },
          data: {
            ...(title && { title }),
            ...(description && { description }),
            ...(budget && { budget: parseFloat(budget) }),
            ...(deadline && { deadline: new Date(deadline) }),
            ...(status && { status }),
            ...(categories && {
              categories: {
                set: [], // First disconnect all existing categories
                connectOrCreate: categories.map((category: string) => ({
                  where: { name: category },
                  create: { name: category },
                })),
              },
            }),
          },
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
            categories: true,
          },
        });

        return res.status(200).json(updatedTender);

      case 'DELETE':
        // Delete a tender
        await prisma.tender.delete({
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