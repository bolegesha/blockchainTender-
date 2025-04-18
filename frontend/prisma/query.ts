import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Query all tables
  const users = await prisma.user.findMany();
  const tenders = await prisma.tender.findMany();
  const bids = await prisma.bid.findMany();
  const documents = await prisma.document.findMany();
  const categories = await prisma.category.findMany();

  console.log('Users:', JSON.stringify(users, null, 2));
  console.log('Tenders:', JSON.stringify(tenders, null, 2));
  console.log('Bids:', JSON.stringify(bids, null, 2));
  console.log('Documents:', JSON.stringify(documents, null, 2));
  console.log('Categories:', JSON.stringify(categories, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 