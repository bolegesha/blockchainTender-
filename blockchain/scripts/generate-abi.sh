#!/bin/bash

# Compile the contracts
echo "Compiling contracts..."
npx hardhat compile

# Create the ABI directory if it doesn't exist
mkdir -p ../frontend/abi

# Copy the ABI to the frontend
echo "Copying TenderChain ABI to frontend..."
cp artifacts/contracts/TenderChain.sol/TenderChain.json ../frontend/abi/

echo "ABI file generated and copied to frontend/abi/TenderChain.json"
echo "You can now import it in your frontend code:"
echo "import TenderChainABI from '../abi/TenderChain.json';" 