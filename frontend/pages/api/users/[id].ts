import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get a user by ID
        const user = await prisma.user.findUnique({
          where: { id },
          include: {
            tenders: {
              select: {
                id: true,
                title: true,
                status: true,
                createdAt: true,
                _count: {
                  select: { bids: true },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
            bids: {
              select: {
                id: true,
                amount: true,
                status: true,
                createdAt: true,
                tender: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json(user);

      case 'PUT':
        // Update a user's profile
        const { name, email } = req.body;

        const updatedUser = await prisma.user.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(email && { email }),
          },
        });

        return res.status(200).json(updatedUser);

      case 'DELETE':
        // Delete a user (careful with this one - should handle associated data)
        await prisma.user.delete({
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