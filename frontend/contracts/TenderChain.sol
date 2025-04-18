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

    // Структура для хранения заявок на тендер
    struct Bid {
        uint256 id;          // Уникальный идентификатор заявки
        uint256 tenderId;    // ID тендера, к которому относится заявка
        address bidder;      // Адрес участника, сделавшего заявку
        uint256 amount;      // Предлагаемая сумма
        bytes32 detailsHash; // Хеш деталей заявки (для верификации)
        BidStatus status;    // Статус заявки
        uint256 timestamp;   // Время создания заявки
    }

    enum TenderStatus { OPEN, CLOSED, AWARDED, COMPLETED, CANCELLED }
    enum BidStatus { PENDING, ACCEPTED, REJECTED }

    mapping(uint256 => Tender) public tenders;
    mapping(uint256 => Bid[]) public tenderBids; // Заявки по ID тендера
    uint256 public tenderCount;
    uint256 public bidCount;

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

    event BidSubmitted(
        uint256 indexed id,
        uint256 indexed tenderId,
        address indexed bidder,
        uint256 amount,
        uint256 timestamp
    );

    event BidAccepted(
        uint256 indexed id,
        uint256 indexed tenderId,
        address indexed bidder,
        uint256 timestamp
    );

    event BidRejected(
        uint256 indexed id,
        uint256 indexed tenderId,
        address indexed bidder,
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

    // Подать заявку на тендер
    function submitBid(uint256 _tenderId, uint256 _amount, bytes32 _detailsHash) public returns (uint256) {
        Tender storage tender = tenders[_tenderId];
        
        require(tender.creator != address(0), "Tender does not exist");
        require(tender.creator != msg.sender, "Cannot bid on your own tender");
        require(tender.status == TenderStatus.OPEN, "Tender is not open");
        require(tender.expiresAt > block.timestamp, "Tender has expired");
        require(_amount > 0, "Bid amount must be greater than 0");
        
        // Создаем новую заявку
        uint256 bidId = bidCount++;
        
        Bid memory newBid = Bid({
            id: bidId,
            tenderId: _tenderId,
            bidder: msg.sender,
            amount: _amount,
            detailsHash: _detailsHash,
            status: BidStatus.PENDING,
            timestamp: block.timestamp
        });
        
        // Добавляем заявку в массив заявок этого тендера
        tenderBids[_tenderId].push(newBid);
        
        emit BidSubmitted(bidId, _tenderId, msg.sender, _amount, block.timestamp);
        
        return bidId;
    }

    // Получить все заявки на тендер
    function getBidsForTender(uint256 _tenderId) public view returns (Bid[] memory) {
        require(tenders[_tenderId].creator != address(0), "Tender does not exist");
        
        // Возвращаем копию массива заявок для этого тендера
        return tenderBids[_tenderId];
    }

    // Получить количество заявок для тендера
    function getBidCountForTender(uint256 _tenderId) public view returns (uint256) {
        return tenderBids[_tenderId].length;
    }

    // Принять заявку (только создатель тендера)
    function acceptBid(uint256 _tenderId, uint256 _bidId) public {
        Tender storage tender = tenders[_tenderId];
        
        require(tender.creator == msg.sender, "Only creator can accept bids");
        require(tender.status == TenderStatus.OPEN, "Tender is not open");
        
        // Находим заявку в массиве
        bool bidFound = false;
        address bidder;
        
        for (uint256 i = 0; i < tenderBids[_tenderId].length; i++) {
            if (tenderBids[_tenderId][i].id == _bidId) {
                require(tenderBids[_tenderId][i].status == BidStatus.PENDING, "Bid is not pending");
                
                // Меняем статус заявки на ACCEPTED
                tenderBids[_tenderId][i].status = BidStatus.ACCEPTED;
                bidder = tenderBids[_tenderId][i].bidder;
                bidFound = true;
                
                // Обновляем статус остальных заявок на REJECTED
                for (uint256 j = 0; j < tenderBids[_tenderId].length; j++) {
                    if (j != i && tenderBids[_tenderId][j].status == BidStatus.PENDING) {
                        tenderBids[_tenderId][j].status = BidStatus.REJECTED;
                        emit BidRejected(
                            tenderBids[_tenderId][j].id,
                            _tenderId,
                            tenderBids[_tenderId][j].bidder,
                            block.timestamp
                        );
                    }
                }
                
                break;
            }
        }
        
        require(bidFound, "Bid not found");
        
        // Обновляем статус тендера и назначаем исполнителя
        tender.status = TenderStatus.AWARDED;
        tender.bidder = bidder;
        
        emit BidAccepted(_bidId, _tenderId, bidder, block.timestamp);
        emit TenderTaken(_tenderId, bidder, block.timestamp);
    }

    // Отклонить заявку (только создатель тендера)
    function rejectBid(uint256 _tenderId, uint256 _bidId) public {
        Tender storage tender = tenders[_tenderId];
        
        require(tender.creator == msg.sender, "Only creator can reject bids");
        require(tender.status == TenderStatus.OPEN, "Tender is not open");
        
        // Находим заявку в массиве
        bool bidFound = false;
        address bidder;
        
        for (uint256 i = 0; i < tenderBids[_tenderId].length; i++) {
            if (tenderBids[_tenderId][i].id == _bidId) {
                require(tenderBids[_tenderId][i].status == BidStatus.PENDING, "Bid is not pending");
                
                // Меняем статус заявки на REJECTED
                tenderBids[_tenderId][i].status = BidStatus.REJECTED;
                bidder = tenderBids[_tenderId][i].bidder;
                bidFound = true;
                break;
            }
        }
        
        require(bidFound, "Bid not found");
        
        emit BidRejected(_bidId, _tenderId, bidder, block.timestamp);
    }
} 