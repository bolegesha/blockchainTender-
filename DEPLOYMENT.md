# TenderChain Deployment Guide

This guide walks you through the process of deploying both the blockchain smart contract and the Next.js frontend for the TenderChain application.

## Prerequisites

- Node.js v14+ and npm/yarn/pnpm
- An Ethereum wallet (e.g., MetaMask)
- Git

## Step 1: Deploy the Smart Contract

1. Navigate to the blockchain directory:
   ```sh
   cd blockchain
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Deploy the contract:
   ```sh
   # For local development
   ./scripts/deploy-script.sh
   
   # For testnet deployment (e.g., Sepolia)
   ./scripts/deploy-script.sh sepolia
   ```

4. Generate the ABI for the frontend:
   ```sh
   ./scripts/generate-abi.sh
   ```

5. Note the deployed contract address from the console output. You'll need this in the next step.

## Step 2: Configure the Frontend

1. Navigate to the frontend directory:
   ```sh
   cd frontend
   ```

2. Update the contract address in your environment files:
   - Edit `.env` and `.env.local` to set:
     ```
     NEXT_PUBLIC_CONTRACT_ADDRESS=YOUR_DEPLOYED_CONTRACT_ADDRESS
     ```

3. Install dependencies:
   ```sh
   npm install
   ```

## Step 3: Start the Application

1. Start the Next.js development server:
   ```sh
   npm run dev
   ```

2. Open your browser and navigate to http://localhost:3001

## Step 4: Interact with the Application

1. Connect your MetaMask wallet to the application
2. Create new tenders or browse existing ones
3. Interact with the tenders based on your role (creator or bidder)

## Deployment to Production

### Frontend Deployment

For production deployment of the Next.js frontend, you can use services like Vercel, Netlify, or AWS Amplify:

1. **Vercel** (recommended for Next.js):
   ```sh
   npm install -g vercel
   vercel
   ```

2. **Netlify**:
   ```sh
   npm install -g netlify-cli
   netlify deploy
   ```

### Smart Contract Deployment

For production deployment of the smart contract, deploy to the Ethereum mainnet:

```sh
./scripts/deploy-script.sh mainnet
```

Note: Mainnet deployment requires real ETH and should only be done after thorough testing on testnets.

## Troubleshooting

- **Contract interaction issues**: Ensure your wallet is connected to the correct network where the contract is deployed.
- **Frontend not showing data**: Check that the `NEXT_PUBLIC_CONTRACT_ADDRESS` is correct and the server has been restarted.
- **Deployment errors**: Verify you have sufficient funds in your wallet for gas fees.

## Maintenance

After deployment, you may need to:

1. Update the contract: Deploy a new version and update the address in the frontend
2. Update the frontend: Deploy the updated frontend code to your hosting service
3. Monitor contract events: Set up monitoring for contract events to track activity 