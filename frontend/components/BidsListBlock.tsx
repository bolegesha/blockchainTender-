import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import useContractTender from '../hooks/useContractTender';
import { toast } from 'react-hot-toast';

interface BlockchainBid {
  id: string;
  bidder: string;
  amount: number;
  timestamp: string;
  status: string;
}

interface BidsListBlockProps {
  tenderId: string;
  onRefresh?: () => void;
}

const BidsListBlock: React.FC<BidsListBlockProps> = ({ tenderId, onRefresh }) => {
  const [bids, setBids] = useState<BlockchainBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { account } = useWeb3();
  const { getBidsForTender, isContractAvailable } = useContractTender();

  const fetchBids = useCallback(async () => {
    if (!tenderId || isNaN(Number(tenderId))) {
      setError('Invalid tender ID');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isContractAvailable) {
        // Fetch bids from blockchain
        const response = await getBidsForTender(tenderId);
        
        if (response.success && response.data) {
          console.log('Blockchain bids:', response.data);
          setBids(response.data.filter(bid => 
            bid && bid.bidder && bid.bidder !== '0x0000000000000000000000000000000000000000'
          ));
        } else if (response.error) {
          console.error('Error fetching blockchain bids:', response.error);
          setError(`Не удалось загрузить заявки: ${response.error}`);
        } else {
          setBids([]);
        }
      } else {
        setError('Смарт-контракт недоступен');
      }
    } catch (err) {
      console.error('Error fetching bids:', err);
      setError('Произошла ошибка при загрузке заявок');
    } finally {
      setLoading(false);
    }
  }, [tenderId, isContractAvailable, getBidsForTender]);

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

  const handleRefresh = () => {
    fetchBids();
    if (onRefresh) onRefresh();
    toast.success('Данные обновлены');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Заявки из блокчейна</h2>
        </div>
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          Загрузка заявок...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Заявки из блокчейна</h2>
          <button 
            onClick={handleRefresh}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
          >
            Обновить
          </button>
        </div>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Заявки из блокчейна {bids.length > 0 && `(${bids.length})`}</h2>
        <button 
          onClick={handleRefresh}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
        >
          Обновить
        </button>
      </div>

      {bids.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Пока нет заявок на этот тендер в блокчейне
        </div>
      ) : (
        <div className="space-y-4">
          {bids.map((bid) => (
            <div 
              key={bid.id} 
              className={`border rounded-lg p-4 ${isUserBidder(bid.bidder) ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">
                    <span className="text-gray-500">Участник: </span>
                    <span className="font-mono">{formatAddress(bid.bidder)}</span>
                    {isUserBidder(bid.bidder) && (
                      <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                        Ваша заявка
                      </span>
                    )}
                  </p>
                  <p className="mt-2">
                    <span className="text-gray-500">Сумма: </span>
                    <span className="font-semibold">{bid.amount} ETH</span>
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    {new Date(bid.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-medium
                    ${bid.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : 
                      bid.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 
                      'bg-yellow-100 text-yellow-800'}`}>
                    {bid.status === 'ACCEPTED' ? 'Принята' : 
                     bid.status === 'REJECTED' ? 'Отклонена' : 
                     'На рассмотрении'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BidsListBlock; 