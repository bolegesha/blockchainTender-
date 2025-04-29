# TenderChain Smart Contract

This directory contains the smart contract for the TenderChain application, which allows users to create, manage, and interact with tenders on the blockchain.

## Prerequisites

- Node.js v14+ and npm/yarn/pnpm
- [Hardhat](https://hardhat.org/)
- An Ethereum wallet (e.g., MetaMask) for deploying to a testnet

## Project Structure

```
blockchain/
├── contracts/            # Smart contract source files
│   └── TenderChain.sol   # Main tender contract
├── scripts/              # Deployment and utility scripts
│   ├── deploy.js         # Contract deployment script
│   ├── deploy-script.sh  # Helper script for deployment
│   └── generate-abi.sh   # Script to generate ABI for frontend
├── hardhat.config.js     # Hardhat configuration
└── README.md             # This file
```

## Getting Started

### Installation

1. Install dependencies:
   ```sh
   npm install
   ```

### Local Development

1. Start a local Ethereum node:
   ```sh
   npx hardhat node
   ```

2. In a new terminal, deploy the contract to the local network:
   ```sh
   npx hardhat run scripts/deploy.js --network localhost
   ```

   Or use the deployment helper script:
   ```sh
   ./scripts/deploy-script.sh
   ```

3. Generate the ABI file for the frontend:
   ```sh
   ./scripts/generate-abi.sh
   ```

### Deploying to a Testnet

1. Update the `hardhat.config.js` file with your network configuration:
   ```js
   module.exports = {
     solidity: "0.8.20",
     networks: {
       // Local development network
       localhost: {
         url: "http://127.0.0.1:8545",
       },
       // Ethereum Sepolia testnet
       sepolia: {
         url: process.env.SEPOLIA_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
         accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
       },
       // Other networks...
     },
   };
   ```

2. Create a `.env` file with your private key and network URL:
   ```
   PRIVATE_KEY=your_wallet_private_key
   SEPOLIA_URL=https://sepolia.infura.io/v3/your_infura_project_id
   ```

3. Deploy to the desired network:
   ```sh
   npx hardhat run scripts/deploy.js --network sepolia
   ```
   
   Or use the deployment helper script:
   ```sh
   ./scripts/deploy-script.sh sepolia
   ```

## After Deployment

After deploying the contract, you need to:

1. Copy the contract address from the deployment output
2. Update the `NEXT_PUBLIC_CONTRACT_ADDRESS` in `frontend/.env` and `frontend/.env.local`
3. Restart your Next.js server to apply the changes

## Contract Functionality

The TenderChain contract provides the following functionality:

- **createTender**: Create a new tender with details
- **getTender**: Get information about a specific tender
- **getActiveTenders**: Get all active tenders
- **takeTender**: Accept a tender as a bidder
- **completeTender**: Mark a tender as completed
- **cancelTender**: Cancel an open tender

## Testing

Run tests with:

```sh
npx hardhat test
```

## License

This project is licensed under the MIT License. 

## Fixing Tender Synchronization Issues

If you encounter "Tender does not exist" errors when trying to interact with tenders in the blockchain, you can use the synchronization fixer tool to check and resolve these issues:

1. First, make sure your Hardhat node is running:
   ```
   npx hardhat node
   ```

2. In a separate terminal, run the fix-tender-sync.js script:
   ```
   npx hardhat run scripts/fix-tender-sync.js --network localhost
   ```

3. Follow the prompts to:
   - Check if a tender exists in the blockchain
   - Create a tender in the blockchain
   - List all active tenders

### Common Issues

1. **"Tender does not exist" error**: This happens when a tender exists in the database but not in the blockchain. Use the fix-tender-sync.js script to create it in the blockchain.

2. **Contract function mismatch**: The TenderChain.sol contract uses `takeTender()` to participate in a tender, not `submitBid()`. If you see "contractRef.current.submitBid is not a function", it means your frontend is trying to call a function that doesn't exist.

3. **Network mismatch**: Make sure your MetaMask is connected to the correct network (Localhost:8545 for development). 