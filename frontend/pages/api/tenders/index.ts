import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        console.log('Fetching all tenders...');
        const tenders = await prisma.tender.findMany({
          include: {
            creator: true,
            categories: true,
            _count: {
              select: {
                bids: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        console.log('Fetched tenders:', tenders);
        return res.status(200).json(tenders);

      case 'POST':
        console.log('Received POST request with body:', req.body);
        const { title, description, budget, deadline, walletAddress, categories } = req.body;

        console.log('Creating tender with data:', { 
          title, description, budget, deadline, walletAddress, categories 
        });

        if (!title || !description || budget === undefined || !deadline || !walletAddress) {
          console.log('Missing required fields:', {
            hasTitle: !!title,
            hasDescription: !!description,
            hasBudget: budget !== undefined,
            hasDeadline: !!deadline,
            hasWalletAddress: !!walletAddress
          });
          return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'All fields (title, description, budget, deadline, walletAddress) are required' 
          });
        }

        try {
          console.log('Attempting to upsert user with wallet address:', walletAddress);
          // Get or create user based on wallet address
          const user = await prisma.user.upsert({
            where: { walletAddress },
            update: {}, // No updates needed if user exists
            create: {
              walletAddress,
            },
          });
          console.log('User upserted successfully:', user);

          // Process categories
          let categoryConnections = [];
          if (categories && categories.length > 0) {
            console.log('Processing categories:', categories);
            categoryConnections = await Promise.all(
              categories.map(async (categoryName: string) => {
                const category = await prisma.category.upsert({
                  where: { name: categoryName },
                  update: {},
                  create: { name: categoryName },
                });
                console.log('Category upserted:', category);
                return { id: category.id };
              })
            );
          }
          console.log('Category connections prepared:', categoryConnections);

          // Create the tender
          console.log('Creating tender with data:', {
            title,
            description,
            budget: parseFloat(budget.toString()),
            deadline: new Date(deadline),
            creatorId: user.id,
            categoryIds: categoryConnections.map(c => c.id)
          });

          const newTender = await prisma.tender.create({
            data: {
              title,
              description,
              budget: parseFloat(budget.toString()),
              deadline: new Date(deadline),
              creator: {
                connect: { id: user.id },
              },
              categories: {
                connect: categoryConnections,
              },
            },
            include: {
              creator: true,
              categories: true,
            },
          });

          console.log('Tender created successfully:', newTender);
          return res.status(201).json(newTender);
        } catch (dbError: any) {
          console.error('Database error during tender creation:', {
            error: dbError,
            message: dbError.message,
            code: dbError.code,
            stack: dbError.stack
          });
          return res.status(500).json({ 
            error: 'Database operation failed', 
            details: dbError.message,
            code: dbError.code || 'UNKNOWN',
            stack: process.env.NODE_ENV === 'development' ? dbError.stack : undefined
          });
        }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('Request error in tenders API:', {
      error,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Error processing your request', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 