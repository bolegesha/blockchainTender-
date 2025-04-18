// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Tender {
    struct TenderDetails {
        uint256 distance;
        uint256 weight;
        string cargoType;
        uint256 urgencyDays;
        uint256 commitEnd;
        uint256 revealEnd;
        address creator;
        bool isActive;
    }

    struct Bid {
        bytes32 commitHash;
        uint256 revealedBid;
        bool isRevealed;
    }

    // Tender management
    uint256 public nextTenderId = 1;
    mapping(uint256 => TenderDetails) public tenders;
    mapping(uint256 => mapping(address => Bid)) public bids;
    
    // Events
    event TenderCreated(
        uint256 tenderId,
        uint256 distance,
        uint256 weight,
        string cargoType,
        uint256 urgencyDays,
        uint256 commitEnd,
        uint256 revealEnd,
        address creator
    );
    event BidCommitted(uint256 tenderId, address bidder);
    event BidRevealed(uint256 tenderId, address bidder, uint256 bidAmount);
    event TenderClosed(uint256 tenderId, address winner, uint256 winningBid);

    // Create a new tender
    function createTender(
        uint256 distance,
        uint256 weight,
        string memory cargoType,
        uint256 urgencyDays,
        uint256 commitEnd,
        uint256 revealEnd
    ) external {
        require(commitEnd > block.timestamp, "Commit end must be in future");
        require(revealEnd > commitEnd, "Reveal must be after commit");
        require(weight > 0, "Weight must be positive");
        require(distance > 0, "Distance must be positive");

        uint256 tenderId = nextTenderId++;
        tenders[tenderId] = TenderDetails({
            distance: distance,
            weight: weight,
            cargoType: cargoType,
            urgencyDays: urgencyDays,
            commitEnd: commitEnd,
            revealEnd: revealEnd,
            creator: msg.sender,
            isActive: true
        });

        emit TenderCreated(
            tenderId,
            distance,
            weight,
            cargoType,
            urgencyDays,
            commitEnd,
            revealEnd,
            msg.sender
        );
    }

    // Commit phase: submit bid hash
    function commitBid(uint256 tenderId, bytes32 bidHash) external {
        require(tenders[tenderId].isActive, "Tender not active");
        require(block.timestamp < tenders[tenderId].commitEnd, "Commit phase ended");
        
        bids[tenderId][msg.sender].commitHash = bidHash;
        emit BidCommitted(tenderId, msg.sender);
    }

    // Reveal phase: reveal actual bid
    function revealBid(uint256 tenderId, uint256 bidAmount, bytes32 secret) external {
        require(tenders[tenderId].isActive, "Tender not active");
        require(block.timestamp >= tenders[tenderId].commitEnd, "Commit phase not ended");
        require(block.timestamp < tenders[tenderId].revealEnd, "Reveal phase ended");
        
        require(
            keccak256(abi.encodePacked(bidAmount, secret)) == bids[tenderId][msg.sender].commitHash,
            "Invalid reveal"
        );
        
        bids[tenderId][msg.sender].revealedBid = bidAmount;
        bids[tenderId][msg.sender].isRevealed = true;
        emit BidRevealed(tenderId, msg.sender, bidAmount);
    }

    // Close tender and select winner (to be called after reveal phase)
    function closeTender(uint256 tenderId) external {
        require(tenders[tenderId].isActive, "Tender not active");
        require(block.timestamp >= tenders[tenderId].revealEnd, "Reveal phase not ended");
        
        // Implement your winner selection logic here
        // This is a placeholder - you'll need to add actual logic
        
        tenders[tenderId].isActive = false;
        emit TenderClosed(tenderId, address(0), 0); // Update with actual winner
    }

    // Helper function to get tender details
    function getTenderDetails(uint256 tenderId) external view returns (
        uint256 distance,
        uint256 weight,
        string memory cargoType,
        uint256 urgencyDays,
        uint256 commitEnd,
        uint256 revealEnd,
        address creator,
        bool isActive
    ) {
        TenderDetails memory tender = tenders[tenderId];
        return (
            tender.distance,
            tender.weight,
            tender.cargoType,
            tender.urgencyDays,
            tender.commitEnd,
            tender.revealEnd,
            tender.creator,
            tender.isActive
        );
    }
}