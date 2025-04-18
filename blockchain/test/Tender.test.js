const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Tender", function () {
  let tender;
  beforeEach(async () => {
    const Tender = await ethers.getContractFactory("Tender");
    tender = await Tender.deploy();
  });

  it("Should commit and reveal a bid", async () => {
    const [_, bidder] = await ethers.getSigners();
    const bidAmount = 100;
    const secret = ethers.utils.formatBytes32String("my-secret");
    const bidHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["uint256", "bytes32"], [bidAmount, secret])
    );

    // Commit
    await tender.connect(bidder).commitBid(1, bidHash);
    
    // Reveal
    await tender.connect(bidder).revealBid(1, bidAmount, secret);
    
    // Проверка
    const bid = await tender.bids(1, bidder.address);
    expect(bid.revealedBid).to.equal(bidAmount);
  });
});