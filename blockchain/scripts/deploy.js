const hre = require("hardhat");

async function main() {
  // Get the contract factory for TenderChain
  console.log("Deploying TenderChain contract...");
  const TenderChain = await hre.ethers.getContractFactory("TenderChain");
  
  // Deploy the contract
  const tenderChain = await TenderChain.deploy();

  // Wait for deployment to complete
  await tenderChain.deployed();
  
  console.log("TenderChain contract deployed to:", tenderChain.address);
  console.log("Update NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file with this address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });