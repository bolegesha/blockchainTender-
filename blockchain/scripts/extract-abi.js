const fs = require('fs');
const path = require('path');

// Read the compiled contract artifact
const contractPath = path.join(__dirname, '../artifacts/contracts/TenderChain.sol/TenderChain.json');
const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

// Create the abi directory if it doesn't exist
const abiDir = path.join(__dirname, '../../frontend/abi');
if (!fs.existsSync(abiDir)) {
  fs.mkdirSync(abiDir, { recursive: true });
}

// Extract and save the ABI
const abiPath = path.join(abiDir, 'TenderChain.json');
fs.writeFileSync(abiPath, JSON.stringify(contractArtifact, null, 2));

console.log(`ABI extracted and saved to ${abiPath}`); 