#!/bin/bash

# Check if network is specified, default to localhost
NETWORK=${1:-localhost}

echo "Deploying TenderChain contract to $NETWORK network..."

# Start local network if deploying to localhost
if [ "$NETWORK" = "localhost" ]; then
  echo "Starting local Hardhat node in a new terminal..."
  osascript -e 'tell app "Terminal" to do script "cd $(pwd) && npx hardhat node"' &
  
  # Wait for node to start
  echo "Waiting for local node to start..."
  sleep 5
fi

# Deploy contract
echo "Deploying contract..."
npx hardhat run scripts/deploy.js --network $NETWORK

# Instructions for next steps
echo ""
echo "Deployment completed! Don't forget to:"
echo "1. Copy the contract address from above"
echo "2. Update the NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env and frontend/.env.local"
echo "3. Restart your Next.js server to apply the changes" 