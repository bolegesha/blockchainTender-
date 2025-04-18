import { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import { useWeb3 } from '../../hooks/useWeb3';
import useContractTender, { ContractTender } from '../../hooks/useContractTender';
import useTenderAPI from '../../hooks/useTenderAPI';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import { FormEvent } from 'react';
import Link from 'next/link';
import BidsList from '../../components/BidsList';
import TenderModal, { TenderDetails } from '../../components/TenderModal';
import BidsListBlock from '../../components/BidsListBlock';

// Define TenderStatus
type TenderStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'COMPLETED' | 'CANCELLED';

// Расширенный интерфейс для ContractTender, добавляющий дополнительные поля
interface ExtendedContractTender extends ContractTender {
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
}

// Типизация для BidForm
interface BidFormProps {
  tenderId: string;
  onBidSubmitted: () => void;
  disabled?: boolean;
}

// Типизация для заявки
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
const adaptBlockchainTenderToDetails = (blockchainTender: any): ExtendedContractTender => {
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
    updatedAt: blockchainTender.createdAt // Используем createdAt как запасной вариант
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
        const rawTender = apiResponse.data;
        const details = extractTenderDetails(rawTender.description);
        
        const adaptedTender = {
          ...rawTender,
          isFromBlockchain: false,
          fromBlockchain: false,
          // Extract from description or use default values
          bidder: "0x0000000000000000000000000000000000000000",
          distance: details.distance || 0,
          weight: details.weight || 0,
          cargoType: details.cargoType || "general",
          urgencyDays: details.urgencyDays || 0
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
          
          setTender(adaptBlockchainTenderToDetails(blockchainTender));
          setIsFromDatabase(false);
          setLoading(false);
          return;
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
    if (!tender?.expiresAt) return;
    
    const expiresAt = new Date(tender.expiresAt).getTime();
    
    const timerInterval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      
      setTimeLeft(formatTime(diff));
      
      if (diff <= 0) {
        clearInterval(timerInterval);
      }
    }, 1000);
    
    return () => clearInterval(timerInterval);
  }, [tender?.expiresAt, formatTime]);

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
    if (!tender || !account) return;
    
    // Проверяем, что пользователь не является создателем тендера
    if (tender.creator?.toLowerCase() === account.toLowerCase()) {
      setError('Вы не можете участвовать в собственном тендере');
      return;
    }
    
    setActionLoading(true);
    setError(null);
    
    try {
      const response = await contractTender.takeTender(tender.id);
      
      if (response.success) {
        alert('Тендер успешно забронирован за вами!');
        await fetchTender(); // Обновляем данные тендера
      } else {
        throw new Error(response.error || 'Не удалось забрать тендер');
      }
    } catch (err) {
      console.error("Error taking tender:", err);
      setError(err instanceof Error ? err.message : 'Произошла ошибка при попытке забрать тендер');
    } finally {
      setActionLoading(false);
    }
  };

  // Функция для завершения тендера
  const handleCompleteTender = async () => {
    if (!tender || !account) return;
    
    setActionLoading(true);
    setError(null);
    
    try {
      const response = await contractTender.completeTender(tender.id);
      
      if (response.success) {
        alert('Тендер успешно завершен!');
        await fetchTender(); // Обновляем данные тендера
      } else {
        throw new Error(response.error || 'Не удалось завершить тендер');
      }
    } catch (err) {
      console.error("Error completing tender:", err);
      setError(err instanceof Error ? err.message : 'Произошла ошибка при попытке завершить тендер');
    } finally {
      setActionLoading(false);
    }
  };

  // Функция для отмены тендера
  const handleCancelTender = async () => {
    if (!tender || !account) return;
    
    setActionLoading(true);
    setError(null);
    
    try {
      const response = await contractTender.cancelTender(tender.id);
      
      if (response.success) {
        alert('Тендер успешно отменен!');
        await fetchTender(); // Обновляем данные тендера
      } else {
        throw new Error(response.error || 'Не удалось отменить тендер');
      }
    } catch (err) {
      console.error("Error cancelling tender:", err);
      setError(err instanceof Error ? err.message : 'Произошла ошибка при попытке отменить тендер');
    } finally {
      setActionLoading(false);
    }
  };

  // Компонент для участия в тендере (подачи заявки)
  const BidForm = memo(function BidForm({ tenderId, onBidSubmitted, disabled = false }: BidFormProps) {
    const [amount, setAmount] = useState<string>('');
    const [proposal, setProposal] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    
    const { account } = useWeb3();
    const tenderAPI = useTenderAPI();
    
    // Use parent's contractTender directly (no need to destructure or create new instance)
    const isNumericId = !isNaN(Number(tenderId));
    const canUseBlockchain = isNumericId && contractTender.isContractAvailable && !disabled;
    
    // Добавляем отладочную информацию о состоянии контракта
    useEffect(() => {
      console.log('BidForm Contract Status:', {
        isNumericId,
        contractAvailable: contractTender.isContractAvailable,
        disabled,
        canUseBlockchain,
        accountConnected: !!account,
        tenderId
      });
    }, [isNumericId, contractTender.isContractAvailable, disabled, canUseBlockchain, account, tenderId]);
    
    const handleSubmit = useCallback(async (e: FormEvent) => {
      e.preventDefault();
      
      if (!account) {
        setError('Пожалуйста, подключите кошелек');
        return;
      }
      
      if (!amount || !proposal) {
        setError('Пожалуйста, заполните все поля');
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        console.log(`Submitting bid for tender ${tenderId} with amount: ${amount}, proposal: ${proposal}`);
        console.log('Contract status before submission:', {
          isNumericId, 
          contractAvailable: contractTender.isContractAvailable,
          canUseBlockchain
        });
        
        let success = false;
        
        if (canUseBlockchain) {
          console.log('Submitting to blockchain...');
          toast.loading('Отправка заявки в блокчейн...', { id: 'bid-submission' });
          const numericAmount = parseFloat(amount);
          // Use contractTender directly instead of destructured submitBid
          const result = await contractTender.submitBid(tenderId, numericAmount, proposal);
          console.log('Blockchain submission result:', result);
          success = !!result?.success;
          
          if (success) {
            console.log('Bid submitted to blockchain successfully');
            toast.success('Ваша заявка успешно отправлена в блокчейн!', { id: 'bid-submission' });
            
            // Show transaction hash if available
            if (result.hash) {
              const txHash = result.hash as string;
              const truncatedHash = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
              toast.success(
                <div>
                  <p>Транзакция выполнена!</p>
                  <a 
                    href={`https://sepolia.etherscan.io/tx/${txHash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  >
                    {truncatedHash}
                  </a>
                </div>, 
                { duration: 5000 }
              );
            }
          } else if (result?.error) {
            throw new Error(result.error);
          }
        } else {
          console.log('Submitting to API...');
          toast.loading('Отправка заявки...', { id: 'bid-submission' });
          
          try {
            const result = await tenderAPI.createBid({
              tenderId,
              amount: parseFloat(amount),
              proposal,
            });
            success = !!result.data;
            
            if (success) {
              console.log('Bid submitted to API successfully');
              toast.success('Ваша заявка успешно отправлена!', { id: 'bid-submission' });
            } else if (result.error) {
              // If we're in mock mode, consider it a success anyway
              if (tenderAPI.useMockData) {
                console.log('Using mock data due to API error:', result.error);
                toast.success('Заявка отправлена в демо-режиме (API недоступен)', { id: 'bid-submission' });
                success = true;
              } else {
                throw new Error(result.error);
              }
            }
          } catch (apiError) {
            console.error('API error during bid submission:', apiError);
            
            // Check if we can use mock data as fallback
            if (tenderAPI.useMockData || process.env.NODE_ENV === 'development') {
              console.log('Using mock data due to API issues');
              toast.success('Заявка отправлена в демо-режиме (API недоступен)', { id: 'bid-submission' });
              success = true;
              
              // If not already in mock mode, toggle it if possible
              if (!tenderAPI.useMockData && typeof tenderAPI.toggleMockData === 'function') {
                tenderAPI.toggleMockData();
              }
            } else {
              throw apiError;
            }
          }
        }
        
        if (success) {
          setAmount('');
          setProposal('');
          if (onBidSubmitted) {
            onBidSubmitted();
          }
        }
      } catch (err) {
        console.error('Error submitting bid:', err);
        
        // Create a user-friendly error message
        let errorMessage = 'Ошибка при отправке заявки';
        
        if (err instanceof Error) {
          if (err.message.includes('DOCTYPE html') || err.message.includes('Expected JSON')) {
            errorMessage = 'Сервер временно недоступен. Пожалуйста, попробуйте позже.';
          } else if (err.message.includes('Failed to fetch') || err.message.includes('Network')) {
            errorMessage = 'Проблема с сетевым подключением. Проверьте интернет-соединение.';
          } else if (err.message.includes('rejected') || err.message.includes('user rejected transaction')) {
            errorMessage = 'Транзакция была отклонена пользователем.';
          } else if (err.message.includes('insufficient funds')) {
            errorMessage = 'Недостаточно средств для выполнения транзакции.';
          } else {
            errorMessage = err.message;
          }
        }
        
        setError(errorMessage);
        toast.error(`Ошибка: ${errorMessage}`, { id: 'bid-submission' });
      } finally {
        setLoading(false);
      }
    }, [account, amount, proposal, tenderId, contractTender, tenderAPI, onBidSubmitted, canUseBlockchain]);
    
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h3 className="text-xl font-semibold mb-4">Отправить заявку</h3>
        
        {isNumericId && (
          <div className="mb-4 p-2 bg-gray-100 rounded text-sm">
            <p>
              Статус смарт-контракта: {contractTender.isContractAvailable ? 
                <span className="text-green-600 font-semibold">Доступен</span> : 
                <span className="text-red-600 font-semibold">Недоступен</span>}
            </p>
            <p>ID тендера: {tenderId} ({isNumericId ? 'числовой' : 'не числовой'})</p>
            <p>Метод отправки: {canUseBlockchain ? 'Блокчейн' : 'API'}</p>
            
            {!contractTender.isContractAvailable && (
              <div className="mt-2">
                <p className="text-amber-600 mb-1">Смарт-контракт недоступен - ваша заявка будет отправлена через API</p>
                <button 
                  onClick={() => {
                    toast.loading('Подключение к смарт-контракту...', { id: 'contract-connect' });
                    contractTender.checkContractStatus().then(success => {
                      if (success) {
                        toast.success('Смарт-контракт успешно инициализирован!', { id: 'contract-connect' });
                      } else {
                        toast.error('Не удалось подключиться к смарт-контракту', { id: 'contract-connect' });
                      }
                    });
                  }}
                  className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded"
                >
                  Переподключить смарт-контракт
                </button>
              </div>
            )}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
              Сумма (ETH)
            </label>
            <input
              type="number"
              id="amount"
              step="0.001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="proposal" className="block text-sm font-medium text-gray-700">
              Ваше предложение
            </label>
            <textarea
              id="proposal"
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              rows={4}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          {error && (
            <div className="mb-4 text-red-500 text-sm">{error}</div>
          )}
          
          <button
            type="submit"
            disabled={loading || !account}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
              ${loading || !account ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}`}
          >
            {loading ? 'Отправка...' : 'Отправить заявку'}
          </button>
          
          {!account && (
            <div className="mt-3 text-sm text-gray-500 text-center">
              Вам необходимо подключить кошелек для отправки заявки
            </div>
          )}
        </form>
      </div>
    );
  });

  // Add a function to refresh data after interactions
  const refreshData = useCallback(() => {
    if (id && typeof id === 'string') {
      const isNumericId = !isNaN(Number(id));
      
      // Refresh bids list
      if (isNumericId && tender?.fromBlockchain) {
        console.log('Refreshing blockchain tender data');
        contractTender.getTender(id).then(result => {
          if (result.success && result.data) {
            setTender(adaptBlockchainTenderToDetails(result.data));
          }
        });
      }
    }
  }, [id, tender?.fromBlockchain, contractTender]);
  
  // Add a section to display the tender's bids from blockchain if applicable
  const renderBidsList = () => {
    if (!id || !tender) return null;
    
    return (
      <div className="mt-8">
        <BidsList 
          tenderId={typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''} 
          isBlockchainTender={!!tender.fromBlockchain} 
        />
      </div>
    );
  };

  // Add button for blockchain bid submission
  const renderBidButton = () => {
    if (!tender || !account) return null;
    
    // If this is the creator, don't show bid button
    const isCreator = account && tender.creator && account.toLowerCase() === tender.creator.toLowerCase();
    if (isCreator) {
      return null;
    }
    
    // Only show for open tenders
    if (tender.status !== 'OPEN') {
      return null;
    }
    
    return (
      <div className="mt-6">
        <button
          onClick={() => setShowBidModal(true)}
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md font-medium w-full md:w-auto"
        >
          {tender.fromBlockchain ? 'Участвовать через блокчейн' : 'Отправить заявку'}
        </button>
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
                    <span>{new Date(tender.createdAt).toLocaleString()}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Действует до:</span> 
                    <span>{new Date(tender.expiresAt).toLocaleString()}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Срок исполнения:</span> 
                    <span>{typeof tender.deadline === 'bigint' || typeof tender.deadline === 'number'
                      ? new Date(Number(tender.deadline.toString())).toLocaleString()
                      : new Date(tender.deadline).toLocaleString()}</span>
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Add BidsList after tender details */}
      {renderBidsList()}
      
      {/* Add bid button */}
      {renderBidButton()}
      
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
            budget: String(tender.budget),
            deadline: tender.deadline,
            status: tender.status,
            createdAt: tender.createdAt,
            expiresAt: tender.expiresAt,
            creator: tender.creator,
            timeLeft: tender.timeLeft,
            distance: String(tender.distance || ''),
            weight: String(tender.weight || ''),
            cargoType: tender.cargoType,
            urgencyDays: tender.urgencyDays,
            fromBlockchain: tender.fromBlockchain
          }}
          isOpen={showBidModal}
          onClose={() => setShowBidModal(false)}
          onBidSubmitted={() => {
            fetchTender();
            toast.success('Заявка успешно отправлена!');
          }}
        />
      )}
    </div>
  );
}