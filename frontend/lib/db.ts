import { PrismaClient } from "@prisma/client";

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

// Store the PrismaClient on the global object to prevent multiple instances in development
// This approach should fix issues with Next.js API routes and hot reloading
declare global {
  var prisma: PrismaClient | undefined;
}

// Enhanced error handling with connection testing
const createPrismaClient = () => {
  // Verify DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Display current database URL (with sensitive parts masked)
  const dbUrl = process.env.DATABASE_URL;
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@').replace(/\/([^?]+)\?/, '/****?');
  console.log(`Initializing Prisma with connection: ${maskedUrl}`);

  // Create a new Prisma client instance with enhanced logging
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    errorFormat: 'pretty',
  });

  // Test the connection in development
  if (process.env.NODE_ENV === "development") {
    client.$connect()
      .then(() => {
        console.log('Successfully connected to the database');
      })
      .catch((error: Error) => {
        console.error('Failed to connect to the database:', error);
        // Don't throw the error, just log it
        // This prevents the app from crashing on connection issues
      });
  }

  return client;
};

// Initialize PrismaClient
const prisma = global.prisma || createPrismaClient();

// Only store the client on the global object in development
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma; 