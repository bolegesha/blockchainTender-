import { useState, useEffect, useCallback } from 'react';
import { Bid } from '../hooks/useTenderAPI';
import { useWeb3 } from '../hooks/useWeb3';
import useContractTender from '../hooks/useContractTender';

interface BlockchainBid {
  id: string;
  bidder: string;
  amount: number;
  timestamp: string;
  status: string;
}

interface BidsListProps {
  tenderId: string;
  isBlockchainTender: boolean;
}

const BidsList: React.FC<BidsListProps> = ({ tenderId, isBlockchainTender }) => {
  const [bids, setBids] = useState<(Bid | BlockchainBid)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { account } = useWeb3();
  const { getBidsForTender, isContractAvailable } = useContractTender();

  const fetchBids = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isBlockchainTender && isContractAvailable) {
        // Fetch bids from blockchain
        const response = await getBidsForTender(tenderId);
        
        if (response.success && response.data) {
          console.log('Blockchain bids:', response.data);
          setBids(response.data);
        } else if (response.error) {
          console.error('Error fetching blockchain bids:', response.error);
          setError(`Не удалось загрузить заявки: ${response.error}`);
        }
      } else {
        // For non-blockchain tenders, we would fetch from API
        // This part would need API integration
        setBids([]);
      }
    } catch (err) {
      console.error('Error fetching bids:', err);
      setError('Произошла ошибка при загрузке заявок');
    } finally {
      setLoading(false);
    }
  }, [tenderId, isBlockchainTender, isContractAvailable, getBidsForTender]);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  // Helper function to format addresses
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Check if the current user is a bidder
  const isUserBidder = (bidderAddress: string) => {
    return account && account.toLowerCase() === bidderAddress.toLowerCase();
  };

  if (loading) {
    return <div className="text-center py-8">Загрузка заявок...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        {error}
      </div>
    );
  }

  if (!bids.length) {
    return (
      <div className="bg-gray-100 p-6 rounded text-center">
        <p className="text-gray-600">На данный тендер еще не поступило заявок</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-xl font-bold mb-4">Заявки на тендер</h3>
      <div className="space-y-4">
        {bids.map((bid) => (
          <div 
            key={bid.id} 
            className={`border rounded-lg p-4 ${isUserBidder((bid as any).bidder) ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">
                  <span className="text-gray-500">Участник: </span>
                  <span className="font-mono">{formatAddress((bid as any).bidder)}</span>
                  {isUserBidder((bid as any).bidder) && (
                    <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      Ваша заявка
                    </span>
                  )}
                </p>
                <p className="mt-2">
                  <span className="text-gray-500">Сумма: </span>
                  <span className="font-semibold">{(bid as any).amount} ETH</span>
                </p>
                {(bid as Bid).proposal && (
                  <p className="mt-2">
                    <span className="text-gray-500">Предложение: </span>
                    {(bid as Bid).proposal}
                  </p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  {new Date((bid as any).timestamp || (bid as Bid).createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <span className={`px-2.5 py-0.5 rounded text-xs font-medium
                  ${(bid as any).status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : 
                    (bid as any).status === 'REJECTED' ? 'bg-red-100 text-red-800' : 
                    'bg-yellow-100 text-yellow-800'}`}>
                  {(bid as any).status === 'ACCEPTED' ? 'Принята' : 
                   (bid as any).status === 'REJECTED' ? 'Отклонена' : 
                   'На рассмотрении'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BidsList; 