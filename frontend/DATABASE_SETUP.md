# Neon Postgres Database Setup Guide

This guide will help you set up a Neon Postgres database for the Tender application.

## What is Neon Postgres?

Neon is a fully managed serverless PostgreSQL with a generous free tier. It's perfect for modern applications and separates storage and compute to offer autoscaling capabilities. [Learn more about Neon](https://neon.tech/)

## Getting Started

### 1. Create a Neon account

1. Go to [https://neon.tech/](https://neon.tech/) and sign up for a free account
2. Verify your email address

### 2. Create a new Neon project

1. From the Neon dashboard, click "New Project"
2. Choose a name for your project (e.g., "tender")
3. Select a PostgreSQL version (the latest version is recommended)
4. Choose a region closest to your users
5. Click "Create Project"

### 3. Connect to your database

After creating your project, Neon will provide you with connection details:

1. Look for the connection string that looks like:
   ```
   postgresql://[user]:[password]@[hostname]/[database]?sslmode=require
   ```

2. Copy this connection string - you'll need it for the next step

### 4. Update your environment variables

1. In the project's `.env` file, replace the placeholder `DATABASE_URL` with your Neon connection string:
   ```
   DATABASE_URL="postgresql://your-username:your-password@your-neon-hostname.neon.tech/tender?sslmode=require"
   ```

### 5. Generate and push the database schema

Run the following commands in your terminal:

```bash
# Generate Prisma Client based on your schema
npx prisma generate

# Push your schema to the database
npx prisma db push
```

### 6. Verify the connection

To verify that your application can connect to the database, run:

```bash
npx prisma studio
```

This will open Prisma Studio, a visual database editor, in your browser. If you can see your database tables, the connection is working correctly.

## Working with the Database

### Prisma Commands

Here are some useful Prisma commands for working with your database:

```bash
# Generate Prisma Client after schema changes
npx prisma generate

# Push schema changes to the database
npx prisma db push

# Reset the database (caution: this will delete all data)
npx prisma db push --force-reset

# Run database migrations (for production)
npx prisma migrate dev --name describe_your_changes

# Open Prisma Studio to view and edit data
npx prisma studio
```

### Database Schema

The tender application uses the following models:

- `User`: Stores user information including wallet addresses
- `Tender`: Stores tender details such as title, description, budget
- `Bid`: Stores bids submitted for tenders
- `Document`: Stores documents related to tenders and bids
- `Category`: Stores categories for organizing tenders

For detailed schema information, see the `prisma/schema.prisma` file.

## Troubleshooting

If you encounter any issues with your database connection:

1. Make sure your `.env` file contains the correct connection string
2. Check that your Neon project is active
3. Verify that your IP address is allowed (Neon may have IP restrictions)
4. Check your database credentials

For more help, refer to the [Neon documentation](https://neon.tech/docs/introduction) or the [Prisma documentation](https://www.prisma.io/docs/).

## Next Steps

After setting up your database, you can:

1. Start your application with `npm run dev` or `pnpm dev`
2. Begin creating users, tenders, and bids through the application
3. Use Prisma Studio to view and manage your data directly 