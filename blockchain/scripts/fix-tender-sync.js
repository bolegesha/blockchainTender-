// Script to fix tender synchronization issues between database and blockchain
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Get contract ABI and address
const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // Update with your contract address
const contractABI = require('../artifacts/contracts/TenderChain.sol/TenderChain.json').abi;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('\n=== Tender Synchronization Fixer Tool ===\n');

  try {
    // Connect to provider
    console.log('Connecting to Ethereum network...');
    
    // Try both local Hardhat node and a public provider as fallback
    let provider;
    try {
      provider = new ethers.JsonRpcProvider('http://localhost:8545');
      await provider.getBlockNumber(); // Test connection
      console.log('Connected to local Hardhat node');
    } catch (error) {
      console.log('Could not connect to local Hardhat node, trying public provider');
      provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/'); // You can add your API key here
      await provider.getBlockNumber(); // Test connection
      console.log('Connected to Sepolia testnet');
    }

    // Get signer
    let wallet;
    const question = (query) => new Promise((resolve) => rl.question(query, resolve));
    
    const useWalletMethod = await question('How do you want to connect your wallet?\n1. Private key\n2. JSON file\nChoose (1/2): ');
    
    if (useWalletMethod === '1') {
      const privateKey = await question('Enter your private key: ');
      wallet = new ethers.Wallet(privateKey, provider);
    } else {
      const keystore = await question('Enter path to your keystore JSON file: ');
      const password = await question('Enter password for keystore: ');
      const keystoreContent = fs.readFileSync(keystore, 'utf8');
      wallet = await ethers.Wallet.fromEncryptedJson(keystoreContent, password);
      wallet = wallet.connect(provider);
    }
    
    console.log(`Connected with wallet: ${wallet.address}`);

    // Create contract instance
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);
    
    // Get current tender count
    const tenderCount = await contract.tenderCount();
    console.log(`Current tender count in contract: ${tenderCount}`);
    
    // Check existing tenders
    console.log('\nChecking existing tenders...');

    // Show options
    console.log('\nWhat would you like to do?');
    console.log('1. Check if a tender exists in the blockchain');
    console.log('2. Create a new tender in the blockchain');
    console.log('3. List all active tenders');
    console.log('4. Exit');

    const choice = await question('\nEnter your choice (1-4): ');

    switch (choice) {
      case '1':
        await checkTender(contract);
        break;
      case '2':
        await createTender(contract);
        break;
      case '3':
        await listActiveTenders(contract);
        break;
      case '4':
        console.log('Exiting...');
        break;
      default:
        console.log('Invalid choice');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    rl.close();
  }
}

async function checkTender(contract) {
  const tenderId = await new Promise((resolve) => {
    rl.question('Enter tender ID to check: ', resolve);
  });

  try {
    console.log(`Checking tender with ID: ${tenderId}...`);
    const tender = await contract.getTender(tenderId);
    console.log('\nTender exists in blockchain:');
    console.log({
      id: tender.id.toString(),
      title: tender.title,
      description: tender.description,
      budget: tender.budget.toString(),
      deadline: new Date(Number(tender.deadline) * 1000).toLocaleString(),
      distance: tender.distance.toString(),
      weight: tender.weight.toString(),
      cargoType: tender.cargoType,
      urgencyDays: tender.urgencyDays.toString(),
      creator: tender.creator,
      bidder: tender.bidder,
      status: ['OPEN', 'CLOSED', 'AWARDED', 'COMPLETED', 'CANCELLED'][Number(tender.status)],
      createdAt: new Date(Number(tender.createdAt) * 1000).toLocaleString(),
      expiresAt: new Date(Number(tender.expiresAt) * 1000).toLocaleString()
    });
  } catch (error) {
    if (error.message.includes('Tender does not exist')) {
      console.log(`\nTender with ID ${tenderId} does not exist in the blockchain.`);
      console.log('You may need to create it first.');
    } else {
      console.error('Error checking tender:', error);
    }
  }
}

async function createTender(contract) {
  try {
    const title = await new Promise((resolve) => {
      rl.question('Enter tender title: ', resolve);
    });
    
    const description = await new Promise((resolve) => {
      rl.question('Enter tender description: ', resolve);
    });
    
    const budget = await new Promise((resolve) => {
      rl.question('Enter tender budget: ', resolve);
    });
    
    const deadlineDays = await new Promise((resolve) => {
      rl.question('Enter deadline in days from now: ', resolve);
    });
    
    const distance = await new Promise((resolve) => {
      rl.question('Enter distance in km: ', resolve);
    });
    
    const weight = await new Promise((resolve) => {
      rl.question('Enter weight in kg: ', resolve);
    });
    
    const cargoType = await new Promise((resolve) => {
      rl.question('Enter cargo type (general/fragile/perishable): ', resolve);
    });
    
    const urgencyDays = await new Promise((resolve) => {
      rl.question('Enter urgency in days: ', resolve);
    });
    
    const expirationMinutes = await new Promise((resolve) => {
      rl.question('Enter expiration time in minutes: ', resolve);
    });

    const deadline = Math.floor(Date.now() / 1000) + (parseInt(deadlineDays) * 24 * 60 * 60);
    
    console.log('\nCreating tender with the following parameters:');
    console.log({
      title,
      description,
      budget,
      deadline: new Date(deadline * 1000).toLocaleString(),
      distance,
      weight,
      cargoType,
      urgencyDays,
      expirationMinutes
    });
    
    const confirm = await new Promise((resolve) => {
      rl.question('\nConfirm creation? (y/n): ', resolve);
    });
    
    if (confirm.toLowerCase() === 'y') {
      console.log('Sending transaction...');
      const tx = await contract.createTender(
        title,
        description,
        budget,
        deadline,
        distance,
        weight,
        cargoType,
        urgencyDays,
        expirationMinutes
      );
      
      console.log(`Transaction sent: ${tx.hash}`);
      console.log('Waiting for confirmation...');
      
      const receipt = await tx.wait();
      
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Try to extract the tender ID from the event logs
      try {
        const event = receipt.logs.find(log => {
          try {
            return log.fragment && log.fragment.name === 'TenderCreated';
          } catch (e) {
            return false;
          }
        });
        
        if (event && event.args) {
          const tenderId = event.args[0].toString();
          console.log(`\nTender created successfully with ID: ${tenderId}`);
        } else {
          console.log('\nTender created successfully, but could not determine ID from logs');
        }
      } catch (error) {
        console.log('\nTender created successfully, but error extracting ID from logs:', error);
      }
    } else {
      console.log('Tender creation cancelled');
    }
  } catch (error) {
    console.error('Error creating tender:', error);
  }
}

async function listActiveTenders(contract) {
  try {
    console.log('Fetching active tenders...');
    const activeTenderIds = await contract.getActiveTenders();
    
    if (activeTenderIds.length === 0) {
      console.log('No active tenders found');
      return;
    }
    
    console.log(`\nFound ${activeTenderIds.length} active tenders:`);
    
    for (let i = 0; i < activeTenderIds.length; i++) {
      const id = activeTenderIds[i].toString();
      const tender = await contract.getTender(id);
      
      console.log(`\n-- Tender #${id} --`);
      console.log(`Title: ${tender.title}`);
      console.log(`Budget: ${tender.budget.toString()}`);
      console.log(`Creator: ${tender.creator}`);
      console.log(`Expires: ${new Date(Number(tender.expiresAt) * 1000).toLocaleString()}`);
    }
  } catch (error) {
    console.error('Error listing active tenders:', error);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 