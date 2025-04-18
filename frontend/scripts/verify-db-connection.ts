import { PrismaClient } from '@prisma/client';

/**
 * This script verifies the connection to the database and retrieves basic information
 * to ensure that the connection is working properly.
 */
async function main() {
  console.log('Starting database connection verification...');
  
  // Display current database URL (with sensitive parts masked)
  const dbUrl = process.env.DATABASE_URL || '';
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@').replace(/\/([^?]+)\?/, '/****?');
  console.log(`Database URL: ${maskedUrl}`);
  
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

  try {
    console.log('Attempting to connect to the database...');
    await prisma.$connect();
    console.log('✅ Connection successful!');

    // Test basic queries
    console.log('\nTesting basic queries:');
    
    // Test users table
    const userCount = await prisma.user.count();
    console.log(`- Users table: ${userCount} records`);
    
    // Test tenders table
    const tenderCount = await prisma.tender.count();
    console.log(`- Tenders table: ${tenderCount} records`);
    
    // Test categories table
    const categoryCount = await prisma.category.count();
    console.log(`- Categories table: ${categoryCount} records`);
    
    console.log('\nDatabase schema verification successful!');
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('Database connection closed.');
  }
}

main()
  .then(() => {
    console.log('Verification completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  }); 