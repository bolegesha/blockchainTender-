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