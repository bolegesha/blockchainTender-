// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TenderChain {
    struct Tender {
        uint256 id;
        string title;
        string description;
        uint256 budget;
        uint256 deadline;
        uint256 distance;
        uint256 weight;
        string cargoType;
        uint256 urgencyDays;
        address creator;
        address bidder;
        TenderStatus status;
        uint256 createdAt;
        uint256 expiresAt; // время, когда тендер больше не будет доступен
    }

    enum TenderStatus { OPEN, CLOSED, AWARDED, COMPLETED, CANCELLED }

    mapping(uint256 => Tender) public tenders;
    uint256 public tenderCount;

    event TenderCreated(
        uint256 indexed id,
        string title,
        uint256 budget,
        address indexed creator,
        uint256 expiresAt
    );

    event TenderTaken(
        uint256 indexed id,
        address indexed bidder,
        uint256 timestamp
    );

    event TenderCompleted(
        uint256 indexed id,
        address indexed bidder,
        uint256 timestamp
    );

    event TenderCancelled(
        uint256 indexed id,
        address indexed creator,
        uint256 timestamp
    );

    // Создание нового тендера с ограничением по времени
    function createTender(
        string memory _title,
        string memory _description,
        uint256 _budget,
        uint256 _deadline,
        uint256 _distance,
        uint256 _weight,
        string memory _cargoType,
        uint256 _urgencyDays,
        uint256 _expirationMinutes // срок в минутах, на который тендер будет доступен
    ) public returns (uint256) {
        require(bytes(_title).length > 0, "Title is required");
        require(_budget > 0, "Budget must be greater than 0");
        require(_deadline > block.timestamp, "Deadline must be in the future");

        uint256 tenderId = tenderCount++;
        uint256 expiresAt = block.timestamp + (_expirationMinutes * 1 minutes);

        tenders[tenderId] = Tender({
            id: tenderId,
            title: _title,
            description: _description,
            budget: _budget,
            deadline: _deadline,
            distance: _distance,
            weight: _weight,
            cargoType: _cargoType,
            urgencyDays: _urgencyDays,
            creator: msg.sender,
            bidder: address(0),
            status: TenderStatus.OPEN,
            createdAt: block.timestamp,
            expiresAt: expiresAt
        });

        emit TenderCreated(tenderId, _title, _budget, msg.sender, expiresAt);
        return tenderId;
    }

    // Получение тендера по ID
    function getTender(uint256 _id) public view returns (
        uint256 id,
        string memory title,
        string memory description,
        uint256 budget,
        uint256 deadline,
        uint256 distance,
        uint256 weight,
        string memory cargoType,
        uint256 urgencyDays,
        address creator,
        address bidder,
        TenderStatus status,
        uint256 createdAt,
        uint256 expiresAt
    ) {
        Tender storage tender = tenders[_id];
        require(tender.creator != address(0), "Tender does not exist");

        return (
            tender.id,
            tender.title,
            tender.description,
            tender.budget,
            tender.deadline,
            tender.distance,
            tender.weight,
            tender.cargoType,
            tender.urgencyDays,
            tender.creator,
            tender.bidder,
            tender.status,
            tender.createdAt,
            tender.expiresAt
        );
    }

    // Получение всех активных тендеров
    function getActiveTenders() public view returns (uint256[] memory) {
        uint256 activeCount = 0;
        
        // Сначала подсчитаем количество активных тендеров
        for (uint256 i = 0; i < tenderCount; i++) {
            if (tenders[i].status == TenderStatus.OPEN && 
                tenders[i].expiresAt > block.timestamp) {
                activeCount++;
            }
        }
        
        uint256[] memory activeTenderIds = new uint256[](activeCount);
        uint256 currentIndex = 0;
        
        // Затем соберем их ID
        for (uint256 i = 0; i < tenderCount; i++) {
            if (tenders[i].status == TenderStatus.OPEN && 
                tenders[i].expiresAt > block.timestamp) {
                activeTenderIds[currentIndex] = i;
                currentIndex++;
            }
        }
        
        return activeTenderIds;
    }

    // "Забрать" тендер
    function takeTender(uint256 _id) public {
        Tender storage tender = tenders[_id];
        
        require(tender.creator != address(0), "Tender does not exist");
        require(tender.creator != msg.sender, "Cannot take your own tender");
        require(tender.status == TenderStatus.OPEN, "Tender is not open");
        require(tender.expiresAt > block.timestamp, "Tender has expired");
        
        tender.bidder = msg.sender;
        tender.status = TenderStatus.AWARDED;
        
        emit TenderTaken(_id, msg.sender, block.timestamp);
    }

    // Завершить тендер (только участник-исполнитель)
    function completeTender(uint256 _id) public {
        Tender storage tender = tenders[_id];
        
        require(tender.bidder == msg.sender, "Only assigned bidder can complete");
        require(tender.status == TenderStatus.AWARDED, "Tender must be awarded");
        
        tender.status = TenderStatus.COMPLETED;
        
        emit TenderCompleted(_id, msg.sender, block.timestamp);
    }

    // Отменить тендер (только создатель)
    function cancelTender(uint256 _id) public {
        Tender storage tender = tenders[_id];
        
        require(tender.creator == msg.sender, "Only creator can cancel");
        require(tender.status == TenderStatus.OPEN, "Can only cancel open tenders");
        
        tender.status = TenderStatus.CANCELLED;
        
        emit TenderCancelled(_id, msg.sender, block.timestamp);
    }
} 