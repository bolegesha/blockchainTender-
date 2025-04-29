import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, memo, FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import { useWeb3 } from '../../hooks/useWeb3';
import useContractTender, { ContractTender, TenderStatus } from '../../hooks/useContractTender';
import useTenderAPI from '../../hooks/useTenderAPI';
import { ethers } from 'ethers';
import Link from 'next/link';
import BidsList from '../../components/BidsList';
import BidsListBlock from '../../components/BidsListBlock';
import TenderModal, { TenderDetails } from '../../components/TenderModal';
import React from 'react';

// Define a simple Bid interface if ../../types/tender is not available
interface Bid {
  id: string;
  bidder: string;
  bidderId?: string;
  amount: number;
  proposal?: string;
  details?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  tenderId?: string;
  transactionHash?: string;
}

// For session handling without next-auth, use a simpler approach
const useSession = () => {
  return { data: null };
};

// Расширенный интерфейс для ContractTender, добавляющий дополнительные поля
interface ExtendedContractTender {
  fromBlockchain?: boolean;
  isFromBlockchain?: boolean;
  // API fields that may not be in the blockchain data
  updatedAt?: string;
  creator: string;
  bidder: string;
  distance: number;
  weight: number;
  cargoType: string;
  urgencyDays: number;
  categories?: Array<string | { id: string; name: string }>;
  // Additional fields from the API
  client?: string;
  contractor?: string;
  ipfsHash?: string;
  category?: string;
  attachments?: any[];
  paymentType?: string;
  skills?: string[];
  location?: string;
  id: string;
  title: string;
  description: string;
  budget: number | string;
  deadline: string | number | bigint;
  status: TenderStatus;
  createdAt: string;
  expiresAt: string;
  timeLeft?: number | string;
  blockchainId?: string;
  bids?: any[];
}

// Типизация для BidForm
interface BidFormProps {
  tenderId: string;
  onBidSubmitted: () => void;
  disabled?: boolean;
}

// Extended Bid interface that includes isFromBlockchain property
interface ExtendedBid extends Bid {
  isFromBlockchain?: boolean;
}

// Extended Bid interface with blockchain properties
interface BlockchainBid {
  id: string;
  bidder: string;
  amount: number;
  status: string;
  timestamp: string | number;
  detailsHash?: string;
  isFromBlockchain?: boolean;
}

// Helper function to check if a string is numeric
const isNumeric = (value: string): boolean => !isNaN(Number(value));

// Helper function to extract tender details from description
const extractTenderDetails = (description: string): any => {
  // Default values
  const details = {
    distance: 0,
    weight: 0,
    cargoType: '',
    urgencyDays: 0
  };
  
  try {
    // Try to extract info from the description
    const distanceMatch = description.match(/расстояние:\s*(\d+)\s*км/i);
    if (distanceMatch) details.distance = parseInt(distanceMatch[1]);
    
    const weightMatch = description.match(/вес:\s*(\d+)\s*кг/i);
    if (weightMatch) details.weight = parseInt(weightMatch[1]);
    
    const cargoMatch = description.match(/тип груза:\s*([^,\n]+)/i);
    if (cargoMatch) details.cargoType = cargoMatch[1].trim();
    
    const urgencyMatch = description.match(/срочность:\s*(\d+)\s*дн/i);
    if (urgencyMatch) details.urgencyDays = parseInt(urgencyMatch[1]);
  } catch (e) {
    console.error("Error parsing tender details:", e);
  }
  
  return details;
};

// Function to extract numbers from a description string with a certain prefix
const extractNumberFromDescription = (description: string, prefix: string): number | null => {
  if (!description) return null;
  const regex = new RegExp(`${prefix}\\s*(\\d+)`);
  const match = description.match(regex);
  return match ? parseInt(match[1], 10) : null;
};

// Function to extract strings from a description string with a certain prefix
const extractStringFromDescription = (description: string, prefix: string): string | null => {
  if (!description) return null;
  const regex = new RegExp(`${prefix}\\s*([\\w-]+)`);
  const match = description.match(regex);
  return match ? match[1] : null;
};

// Helper function to convert a blockchain tender to TenderDetails type
const adaptBlockchainTenderToExtended = (blockchainTender: any): ExtendedContractTender => {
  // Convert budget to number type
  const budget = typeof blockchainTender.budget === 'string' 
    ? parseFloat(blockchainTender.budget) 
    : Number(blockchainTender.budget) || 0;
  
  return {
    id: blockchainTender.id,
    title: blockchainTender.title,
    description: blockchainTender.description,
    budget: budget,
    deadline: blockchainTender.deadline,
    status: blockchainTender.status,
    createdAt: blockchainTender.createdAt,
    expiresAt: blockchainTender.expiresAt,
    distance: blockchainTender.distance,
    weight: blockchainTender.weight,
    cargoType: blockchainTender.cargoType,
    urgencyDays: blockchainTender.urgencyDays,
    creator: blockchainTender.creator,
    bidder: blockchainTender.bidder || "0x0000000000000000000000000000000000000000",
    timeLeft: blockchainTender.timeLeft,
    fromBlockchain: true,
    // Дополнительные поля, требуемые типом ExtendedContractTender
    isFromBlockchain: true,
    updatedAt: blockchainTender.createdAt, // Используем createdAt как запасной вариант
    blockchainId: blockchainTender.blockchainId,
    bids: blockchainTender.bids
  };
};

export default function TenderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { account, connectWallet } = useWeb3();
  const contractTender = useContractTender();
  const tenderAPI = useTenderAPI();
  const [tender, setTender] = useState<ExtendedContractTender | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isFromDatabase, setIsFromDatabase] = useState(true);
  const [showBidModal, setShowBidModal] = useState(false);
  const { data: session } = useSession();
  const [isBidSubmitted, setIsBidSubmitted] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tenderBlockchainStatus, setTenderBlockchainStatus] = useState<{exists: boolean, message: string} | null>(null);
  const [isBlockchainLoading, setIsBlockchainLoading] = useState(false);
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [blockchainError, setBlockchainError] = useState<string | null>(null);

  // Функция для форматирования времени
  const formatTime = useCallback((seconds: number): string => {
    if (seconds <= 0) return 'Время истекло';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return `${minutes}м ${remainingSeconds}с`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return `${hours}ч ${remainingMinutes}м ${remainingSeconds}с`;
  }, []);

  // Функция для получения данных тендера
  const fetchTender = useCallback(async () => {
    if (!id) return;
    
    // Only proceed if we're not already loading
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Сначала пробуем получить из API (базы данных)
      const apiResponse = await tenderAPI.getTenderById(id as string);
      
      if (apiResponse.data) {
        // Extract additional details from the description if applicable
        const extractedDetails = extractTenderDetails(apiResponse.data.description);
        
        const adaptedTender = {
          ...apiResponse.data,
          isFromBlockchain: false,
          fromBlockchain: false,
          // Use optional chaining for properties that may not exist
          bidder: (apiResponse.data as any)?.bidder || "0x0000000000000000000000000000000000000000",
          distance: (apiResponse.data as any)?.distance || 0,
          weight: (apiResponse.data as any)?.weight || 0,
          cargoType: (apiResponse.data as any)?.cargoType || "general",
          urgencyDays: (apiResponse.data as any)?.urgencyDays || 0
        } as unknown as ExtendedContractTender;
        
        setTender(adaptedTender);
        setIsFromDatabase(true);
        setLoading(false);
        return;
      }
      
      // Если в API нет, проверяем блокчейн (если ID числовой и контракт доступен)
      if (isNumeric(id as string) && contractTender.isContractAvailable) {
        console.log("Fetching from blockchain, contract available:", contractTender.isContractAvailable);
        const blockchainResponse = await contractTender.getTender(id as string);
        
        if (blockchainResponse.success && blockchainResponse.data) {
          const blockchainTender = {
            ...blockchainResponse.data,
            isFromBlockchain: true,
            fromBlockchain: true
          };
          
          setTender(adaptBlockchainTenderToExtended(blockchainTender));
          setIsFromDatabase(false);
          setLoading(false);
          return;
        } else {
          // If getTender returned an error, show the error
          console.error("Error from blockchain:", blockchainResponse.error);
          setError(blockchainResponse.error || 'Тендер не найден в блокчейне');
        }
      }
      
      // Если мы дошли до этой точки, значит тендер не найден нигде
      setError('Тендер не найден');
    } catch (error) {
      console.error('Error fetching tender:', error);
      setError('Ошибка при получении данных тендера');
    } finally {
      setLoading(false);
    }
  }, [id, tenderAPI, contractTender.isContractAvailable, contractTender.getTender, loading]);

  // Загрузка данных тендера при загрузке страницы
  useEffect(() => {
    if (id) {
      fetchTender();
    }
  }, [id, fetchTender]);

  // Обновление таймера каждую секунду
  useEffect(() => {
    if (!tender || !tender.expiresAt) return;
    
    const expiresAt = new Date(tender.expiresAt).getTime();
    
    const timerInterval = setInterval(() => {
      const now = Date.now();
      const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
      
      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        setTimeLeft('Время истекло');
      } else {
        setTimeLeft(formatTime(secondsLeft));
      }
    }, 1000);
    
    return () => clearInterval(timerInterval);
  }, [tender?.expiresAt, formatTime]);

  // Safe date rendering helper
  const safeRenderDate = (dateStr: string | number | bigint | undefined) => {
    if (!dateStr) return 'Не указано';
    
    try {
      // Handle different date formats
      if (typeof dateStr === 'bigint') {
        return new Date(Number(dateStr)).toLocaleString();
      } else if (typeof dateStr === 'number') {
        return new Date(dateStr).toLocaleString();
      } else {
        return new Date(dateStr).toLocaleString();
      }
    } catch (e) {
      console.error('Error rendering date:', e);
      return 'Неверный формат даты';
    }
  };

  // Выводим информацию о тендере и условиях для отображения кнопки для участия
  useEffect(() => {
    if (tender) {
      console.log('Tender Status:', {
        id: tender.id,
        status: tender.status,
        isCreator: tender.creator?.toLowerCase() === account?.toLowerCase(),
        account: account,
        isExpired: tender.expiresAt && new Date(tender.expiresAt) < new Date(),
        isBidder: tender.bidder && tender.bidder?.toLowerCase() === account?.toLowerCase(),
        fromBlockchain: tender.fromBlockchain,
        showButton: !isCreator && account && tender.status === 'OPEN' && !(tender.expiresAt && new Date(tender.expiresAt) < new Date()) && !(tender.bidder && tender.bidder?.toLowerCase() === account?.toLowerCase())
      });
    }
  }, [tender, account]);

  // Проверка, может ли текущий пользователь участвовать в тендере
  const canParticipate = useCallback(() => {
    if (!tender || !account) return false;
    
    // Создатель тендера не может участвовать в своем тендере
    const isCreator = tender.creator?.toLowerCase() === account.toLowerCase();
    
    // Проверяем, что тендер открыт и не истек
    const isOpen = tender.status === 'OPEN';
    const isExpired = tender.expiresAt && new Date(tender.expiresAt) < new Date();
    
    return isOpen && !isExpired && !isCreator;
  }, [tender, account]);

  // Функция для "забирания" тендера
  const handleTakeTender = async () => {
    if (!account || !tender) return;
    
    setActionLoading(true);
    setError(null);
    
    try {
      const response = await contractTender.takeTender(tender.id);
      
      if (response.success) {
        alert('Тендер успешно забронирован за вами!');
        // Перезагружаем страницу для обновления данных
        await fetchTender();
      } else {
        setError(response.error || 'Ошибка при бронировании тендера');
      }
    } catch (err) {
      console.error('Error taking tender:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при бронировании тендера');
    } finally {
      setActionLoading(false);
    }
  };

  // Функция для завершения тендера
  const handleCompleteTender = async () => {
    if (!account || !tender) return;
    
    setActionLoading(true);
    setError(null);
    
    try {
      const response = await contractTender.completeTender(tender.id);
      
      if (response.success) {
        alert('Тендер успешно завершен!');
        // Перезагружаем страницу для обновления данных
        await fetchTender();
      } else {
        setError(response.error || 'Ошибка при завершении тендера');
      }
    } catch (err) {
      console.error('Error completing tender:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при завершении тендера');
    } finally {
      setActionLoading(false);
    }
  };

  // Функция для отмены тендера
  const handleCancelTender = async () => {
    if (!account || !tender) return;
    
    setActionLoading(true);
    setError(null);
    
    try {
      const response = await contractTender.cancelTender(tender.id);
      
      if (response.success) {
        alert('Тендер успешно отменен!');
        // Перезагружаем страницу для обновления данных
        await fetchTender();
      } else {
        setError(response.error || 'Ошибка при отмене тендера');
      }
    } catch (err) {
      console.error('Error cancelling tender:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при отмене тендера');
    } finally {
      setActionLoading(false);
    }
  };

  // Refreshing the data when needed
  const refreshData = useCallback(() => {
    if (id && typeof id === 'string' && tender) {
      const isNumericId = !isNaN(Number(id));
      
      // Refresh bids list
      if (isNumericId && tender.fromBlockchain) {
        console.log('Refreshing blockchain tender data');
        contractTender.getTender(id).then(result => {
          if (result.success && result.data) {
            const budgetValue = typeof result.data.budget === 'string' 
              ? parseFloat(result.data.budget) 
              : Number(result.data.budget);
            
            setTender({
              ...tender,
              ...result.data,
              budget: budgetValue,
              fromBlockchain: true
            });
          } else if (result.error) {
            console.error("Error refreshing tender data:", result.error);
            toast.error(`Could not refresh tender: ${result.error}`);
          }
        });
      }
    }
  }, [id, tender, contractTender]);
  
  // Helper function to safely migrate a tender to blockchain
  const migrateTenderToBlockchain = async () => {
    if (!contractTender || !tender) return null;
    
    setIsBlockchainLoading(true);
    setBlockchainError(null);
    
    try {
      const result = await contractTender.migrateTenderToBlockchain(
        tender.id,
        tender.title,
        tender.description,
        String(tender.budget),
        tender.deadline,
        tender.status
      );
      
      return result;
    } catch (error) {
      console.error("Blockchain migration error:", error);
      setBlockchainError(typeof error === 'string' ? error : "Произошла ошибка при переносе тендера в блокчейн");
      return {
        success: false,
        error: typeof error === 'string' ? error : "Произошла ошибка при переносе тендера в блокчейн"
      };
    } finally {
      setIsBlockchainLoading(false);
    }
  };
  
  // Bid Form Component with type-safe props
  const BidForm = memo(({ tenderId, onBidSubmitted, disabled = false }: {
    tenderId: string;
    onBidSubmitted: () => void;
    disabled?: boolean;
  }) => {
    const [amount, setAmount] = useState<string>('');
    const [proposal, setProposal] = useState<string>('');
    const [bidError, setBidError] = useState<string | null>(null);
    const [bidLoading, setBidLoading] = useState<boolean>(false);
    
    const handleSubmit = async (e: FormEvent) => {
      e.preventDefault();
      
      if (!amount || !proposal) {
        setBidError('Please fill in all fields');
        return;
      }
      
      if (!account) {
        setBidError('Please connect your wallet first');
        return;
      }
      
      setBidLoading(true);
      setBidError(null);
      
      try {
        if (contractTender.isContractAvailable) {
          console.log('Submitting bid to blockchain...');
          const response = await contractTender.submitBid(tenderId, parseFloat(amount), proposal);
          
          if (response.success) {
            toast.success('Bid submitted to blockchain successfully!');
            setAmount('');
            setProposal('');
            if (onBidSubmitted) onBidSubmitted();
          } else {
            console.error('Error submitting bid to blockchain:', response.error);
            setBidError(`Blockchain error: ${response.error}`);
          }
        } else {
          setBidError('Contract is not available');
        }
      } catch (error) {
        console.error('Error submitting bid:', error);
        setBidError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setBidLoading(false);
      }
    };
    
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2">Submit Bid</h3>
        
        {bidError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200">
            {bidError}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Amount (USD)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={disabled || bidLoading}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your bid amount"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Proposal</label>
            <textarea
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              disabled={disabled || bidLoading}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Describe your proposal"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || bidLoading || !amount || !proposal}
            className={`w-full py-2 px-4 rounded text-white ${
              bidLoading || !amount || !proposal
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {bidLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              'Submit Bid'
            )}
          </button>
        </form>
      </div>
    );
  });

  // Add a function to verify blockchain status
  const verifyTenderInBlockchain = useCallback(async () => {
    if (!id || !contractTender.isContractAvailable) return;
    
    setIsVerifying(true);
    
    try {
      // Check if tender ID is numeric (blockchain IDs must be numeric)
      const isNumericId = /^\d+$/.test(id as string);
      if (!isNumericId) {
        setTenderBlockchainStatus({
          exists: false,
          message: 'Тендер доступен только в базе данных (ID не является числовым)'
        });
        return;
      }
      
      // Try to get tender from blockchain
      const response = await contractTender.getTender(id as string);
      
      if (response.success && response.data) {
        setTenderBlockchainStatus({
          exists: true,
          message: 'Тендер существует в блокчейне'
        });
      } else {
        setTenderBlockchainStatus({
          exists: false,
          message: response.error || 'Тендер не найден в блокчейне'
        });
      }
    } catch (error: any) {
      console.error('Error verifying tender in blockchain:', error);
      setTenderBlockchainStatus({
        exists: false,
        message: `Ошибка проверки: ${error.message}`
      });
    } finally {
      setIsVerifying(false);
    }
  }, [id, contractTender]);
  
  // Call verification on initial load
  useEffect(() => {
    if (contractTender.isContractAvailable && id) {
      verifyTenderInBlockchain();
    }
  }, [contractTender.isContractAvailable, id, verifyTenderInBlockchain]);

  // Display blockchain verification status if verification was attempted
  const renderBlockchainStatus = () => {
    if (!contractTender.isContractAvailable) return null;
    
    return (
      <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Статус в блокчейне:</h3>
        
        {isVerifying ? (
          <p className="text-sm text-gray-500">Проверка...</p>
        ) : tenderBlockchainStatus ? (
          <div>
            <div className={`flex items-center ${tenderBlockchainStatus.exists ? 'text-green-600' : 'text-amber-600'}`}>
              {tenderBlockchainStatus.exists ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-sm font-medium">{tenderBlockchainStatus.message}</span>
            </div>
            
            {!tenderBlockchainStatus.exists && tender && (
              <button
                onClick={verifyTenderInBlockchain}
                className="mt-2 px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition duration-150"
              >
                Проверить снова
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={verifyTenderInBlockchain}
            className="px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition duration-150"
          >
            Проверить статус в блокчейне
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !tender) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Ошибка!</strong>
            <span className="block sm:inline"> {error || 'Тендер не найден'}</span>
          </div>
        </div>
      </div>
    );
  }

  // Определяем важные переменные состояния в одном месте
  const isCreator = account && tender.creator ? 
    tender.creator.toLowerCase() === account.toLowerCase() : false;
  const isBidder = account && tender.bidder ? 
    tender.bidder.toLowerCase() === account.toLowerCase() : false;
  const isExpired = tender.expiresAt ? new Date(tender.expiresAt) < new Date() : false;
  const canTake = canParticipate();
  const isOpenStatus = tender.status === 'OPEN';
  
  // Добавим больше логирования
  console.log("Current tender state:", { 
    id: tender.id,
    status: tender.status,
    isCreator,
    isBidder,
    isExpired,
    canTake,
    account: account || 'not connected',
    creator: tender.creator,
    bidder: tender.bidder,
    fromBlockchain: tender.fromBlockchain
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{tender.title}</h1>
              <div className={`px-3 py-1 rounded-full text-sm font-medium 
                ${tender.status === 'OPEN' ? 'bg-green-100 text-green-800' : 
                  tender.status === 'AWARDED' ? 'bg-blue-100 text-blue-800' : 
                  tender.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' : 
                  tender.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 
                  'bg-gray-100 text-gray-800'}`}>
                {tender.status === 'OPEN' ? 'Открыт' : 
                 tender.status === 'AWARDED' ? 'Присужден' : 
                 tender.status === 'COMPLETED' ? 'Завершен' : 
                 tender.status === 'CANCELLED' ? 'Отменен' : 'Закрыт'}
              </div>
            </div>

            {!isExpired && tender.status === 'OPEN' && (
              <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-yellow-800 font-medium">
                  Времени осталось: <span className="font-bold">{timeLeft}</span>
                </p>
              </div>
            )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
                <h2 className="text-lg font-semibold mb-2 border-b pb-2">Детали груза</h2>
                <div className="space-y-3">
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Расстояние:</span> 
                    <span>{tender.distance} км</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Вес:</span> 
                    <span>{tender.weight} кг</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Тип груза:</span> 
                    <span>{tender.cargoType === 'general' ? 'Обычный' : 
                          tender.cargoType === 'fragile' ? 'Хрупкий' : 'Скоропортящийся'}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Срок доставки:</span> 
                    <span>{tender.urgencyDays} дней</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Бюджет:</span> 
                    <span>${tender.budget}</span>
                  </p>
                </div>
              </div>
              
              <div>
                <h2 className="text-lg font-semibold mb-2 border-b pb-2">Информация</h2>
                <div className="space-y-3">
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Создан:</span> 
                    <span>{safeRenderDate(tender.createdAt)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Действует до:</span> 
                    <span>{safeRenderDate(tender.expiresAt)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Срок исполнения:</span> 
                    <span>{safeRenderDate(tender.deadline)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Создатель:</span> 
                    <span className="font-mono">{tender.creator.substring(0, 6)}...{tender.creator.substring(tender.creator.length - 4)}</span>
                  </p>
                  {tender.bidder && tender.bidder !== '0x0000000000000000000000000000000000000000' && (
                    <p className="flex justify-between">
                      <span className="font-medium text-gray-600">Исполнитель:</span> 
                      <span className="font-mono">{tender.bidder.substring(0, 6)}...{tender.bidder.substring(tender.bidder.length - 4)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Add blockchain status information here */}
            {renderBlockchainStatus()}
            
            <div className="mt-6 border-t pt-6">
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              
              {isCreator && isOpenStatus && (
                <div className="flex justify-between items-center bg-blue-50 p-4 rounded border border-blue-200 mb-4">
                  <div>
                    <h3 className="font-semibold text-blue-800">Вы создатель этого тендера</h3>
                    <p className="text-blue-700">Вы можете отменить тендер, если нет исполнителя</p>
                    <p className="text-blue-600 italic text-sm mt-1">Обратите внимание: вы не можете участвовать в собственном тендере</p>
                  </div>
                  <button
                    onClick={handleCancelTender}
                    disabled={actionLoading}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
                  >
                    {actionLoading ? 'Отмена...' : 'Отменить тендер'}
                  </button>
                </div>
              )}
              
              {!account && isOpenStatus && !isExpired && (
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-yellow-50 p-6 rounded-lg border border-yellow-200 mb-4 shadow-sm">
                  <div>
                    <h3 className="font-semibold text-yellow-800 text-lg mb-2">Участвовать в тендере</h3>
                    <p className="text-yellow-700">Для участия в тендере необходимо подключить кошелек MetaMask</p>
                  </div>
                  <button
                    onClick={connectWallet}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium w-full md:w-auto"
                  >
                    Подключить кошелек
                  </button>
                </div>
              )}
              
              {isCreator && isOpenStatus && !isExpired && (
                <div className="bg-yellow-50 p-4 rounded border border-yellow-200 mb-4">
                  <p className="text-yellow-700 font-medium">Вы не можете участвовать в собственном тендере</p>
                  <p className="text-yellow-600 text-sm mt-1">Создатели тендеров не могут быть их исполнителями</p>
                </div>
              )}
              
              {!isCreator && account && isOpenStatus && !isExpired && !isBidder && (
                <div>
                  <h2 className="text-2xl font-bold text-green-600 mb-4">Участвовать в тендере</h2>
                  {tender.fromBlockchain ? (
                    <div className="flex flex-col space-y-4">
                      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-green-50 p-6 rounded-lg border border-green-200 mb-4 shadow-sm">
                        <div>
                          <h3 className="font-semibold text-green-800 text-lg mb-2">Варианты участия</h3>
                          <p className="text-green-700">Вы можете забронировать тендер за собой или отправить заявку с предложением своей цены</p>
                        </div>
                        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                          <button
                            onClick={handleTakeTender}
                            disabled={actionLoading || !tender.fromBlockchain}
                            className={`${tender.fromBlockchain 
                              ? "bg-blue-500 hover:bg-blue-600" 
                              : "bg-gray-400 cursor-not-allowed"} text-white px-6 py-3 rounded-md disabled:bg-gray-300 font-medium flex-1 md:flex-none`}
                          >
                            {actionLoading ? 'Обработка...' : 'Забрать тендер'}
                          </button>
                          
                          <button
                            onClick={() => document.getElementById('bid-form-section')?.scrollIntoView({ behavior: 'smooth' })}
                            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md font-medium flex-1 md:flex-none"
                          >
                            Отправить заявку
                          </button>
                        </div>
                      </div>
                      
                      <div id="bid-form-section" className="mt-6">
                        <BidForm 
                          tenderId={typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''} 
                          onBidSubmitted={refreshData} 
                          disabled={false}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-green-50 p-6 rounded-lg border border-green-200 mb-4 shadow-sm">
                        <div>
                          <h3 className="font-semibold text-green-800 text-lg mb-2">Отправить заявку</h3>
                          <p className="text-green-700">Этот тендер существует только в базе данных. Вы можете отправить заявку с вашим предложением.</p>
                        </div>
                        <button
                          onClick={() => document.getElementById('bid-form-section')?.scrollIntoView({ behavior: 'smooth' })}
                          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md font-medium w-full md:w-auto"
                        >
                          Отправить заявку
                        </button>
                      </div>
                      
                      <div id="bid-form-section" className="mt-6">
                        <BidForm 
                          tenderId={typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''} 
                          onBidSubmitted={refreshData} 
                          disabled={false}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Add prominent participation button for both mobile and desktop */}
              {!isCreator && account && isOpenStatus && !isExpired && !isBidder && (
                <div className="fixed bottom-4 right-4 z-10">
                  <button
                    onClick={() => document.getElementById('bid-form-section')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-full shadow-lg font-medium flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Участвовать
                  </button>
                </div>
              )}
              
              {isBidder && tender.status === 'AWARDED' && (
                <div className="flex justify-between items-center bg-green-50 p-4 rounded border border-green-200 mb-4">
                  <div>
                    <h3 className="font-semibold text-green-800">Вы исполнитель этого тендера</h3>
                    <p className="text-green-700">Когда работа будет выполнена, нажмите кнопку "Завершить"</p>
                  </div>
              <button
                    onClick={handleCompleteTender}
                    disabled={actionLoading}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
              >
                    {actionLoading ? 'Выполнение...' : 'Завершить тендер'}
              </button>
            </div>
          )}
              
              {tender.status !== 'OPEN' && tender.status !== 'AWARDED' && (
                <div className={`p-4 rounded ${
                  tender.status === 'COMPLETED' ? 'bg-green-50 border border-green-200' : 
                  tender.status === 'CANCELLED' ? 'bg-red-50 border border-red-200' : 
                  'bg-gray-50 border border-gray-200'
                }`}>
                  <p className={`font-medium ${
                    tender.status === 'COMPLETED' ? 'text-green-800' : 
                    tender.status === 'CANCELLED' ? 'text-red-800' : 
                    'text-gray-800'
                  }`}>
                    Тендер {
                      tender.status === 'COMPLETED' ? 'успешно завершен' : 
                      tender.status === 'CANCELLED' ? 'был отменен' : 
                      'закрыт'
                    }
                  </p>
                </div>
              )}
              
              {/* Debug section - for development only */}
              <div className="mt-8 p-4 border border-gray-300 rounded-md bg-gray-50">
                <h3 className="font-bold mb-2">Отладочная информация:</h3>
                <div className="text-xs font-mono space-y-1">
                  <p>account: {account || 'не подключен'}</p>
                  <p>isCreator: {isCreator ? 'true' : 'false'}</p>
                  <p>isBidder: {isBidder ? 'true' : 'false'}</p>
                  <p>canTake: {canTake ? 'true' : 'false'}</p>
                  <p>status: {tender.status}</p>
                  <p>expiresAt: {tender.expiresAt ? new Date(tender.expiresAt).toLocaleString() : 'не указано'}</p>
                  <p>isExpired: {isExpired ? 'true' : 'false'}</p>
                  <p>Источник: {tender.fromBlockchain ? 'Блокчейн' : 'База данных'}</p>
                  <p>ID: {tender.id}</p>
                  <p>Числовой ID: {!isNaN(Number(tender.id)) ? 'Да' : 'Нет'}</p>
                </div>
                
                {!tender.fromBlockchain && contractTender.isContractAvailable && (
                  <div className="mt-3">
                    <button
                      onClick={async () => {
                        if (!account) {
                          alert("Пожалуйста, подключите кошелек");
                          return;
                        }
                        
                        if (!contractTender.isContractAvailable) {
                          alert("Смарт-контракт недоступен");
                          return;
                        }
                        
                        if (!confirm("Вы хотите мигрировать этот тендер в блокчейн? Это создаст новую копию тендера в блокчейне.")) {
                          return;
                        }
                        
                        try {
                          setIsBlockchainLoading(true);
                          const result = await migrateTenderToBlockchain();
                          
                          if (result && result.success && result.data?.id) {
                            // Update the tender object with the correct property types
                            // that match ExtendedContractTender interface
                            setTender({
                              ...tender,
                              fromBlockchain: true,
                              isFromBlockchain: true,
                              blockchainId: String(result.data.id) // Convert to string to match the interface
                            });
                            
                            toast.success('Тендер успешно создан в блокчейне!');
                            
                            // Close modal and refresh
                            setShowBlockchainModal(false);
                            refreshData();
                          } else {
                            // Use setBlockchainError which is defined in state
                            setBlockchainError(result?.error || 'Не удалось создать тендер в блокчейне');
                          }
                        } catch (error) {
                          console.error("Ошибка миграции тендера:", error);
                          setBlockchainError(error instanceof Error ? error.message : 'Неизвестная ошибка');
                        } finally {
                          setIsBlockchainLoading(false);
                        }
                      }}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      disabled={isBlockchainLoading}
                    >
                      {isBlockchainLoading ? 'Миграция...' : 'Мигрировать в блокчейн'}
                    </button>
                    <p className="mt-1 text-xs text-gray-500">
                      Это создаст копию тендера в блокчейне с новым ID
                    </p>
                    {blockchainError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                        <strong>Ошибка:</strong> {blockchainError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Add BidsList after tender details */}
      {tender && tender.fromBlockchain && (
        <BidsListBlock tenderId={tender.id} onRefresh={() => fetchTender()} />
      )}
      
      {/* Add bid button */}
      {tender && tender.fromBlockchain && (
        <div className="mt-6">
          <button
            onClick={() => setShowBidModal(true)}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md font-medium w-full md:w-auto"
          >
            Участвовать через блокчейн
          </button>
        </div>
      )}
      
      {/* Add the blockchain bids list component if the tender is from blockchain */}
      {tender && tender.fromBlockchain && (
        <BidsListBlock tenderId={tender.id} onRefresh={() => fetchTender()} />
      )}
      
      {/* Modal for submitting a bid */}
      {showBidModal && tender && (
        <TenderModal
          tender={{
            id: tender.id,
            title: tender.title,
            description: tender.description,
            budget: Number(tender.budget),
            deadline: String(tender.deadline),
            status: tender.status,
            createdAt: tender.createdAt,
            expiresAt: tender.expiresAt,
            creator: tender.creator,
            timeLeft: tender.timeLeft ? String(tender.timeLeft) : undefined,
            distance: tender.distance,
            weight: tender.weight,
            cargoType: tender.cargoType,
            urgencyDays: tender.urgencyDays,
            fromBlockchain: tender.fromBlockchain
          }}
          isOpen={showBidModal}
          onClose={() => setShowBidModal(false)}
          onBidSubmitted={async () => {
            await fetchTender();
            toast.success('Заявка успешно отправлена!');
          }}
        />
      )}
    </div>
  );
}