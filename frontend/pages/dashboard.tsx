import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useWeb3 } from '../hooks/useWeb3';
import useTenderAPI, { Tender } from '../hooks/useTenderAPI';
import useContractTender, { ContractTender } from '../hooks/useContractTender';
import TenderCard from '../components/TenderCard';
import Navbar from '../components/Navbar';
import TenderModal, { TenderDetails } from '../components/TenderModal';
import { ethers } from 'ethers';

// Helper functions
const extractNumberFromDescription = (description: string, prefix: string): number | null => {
  const match = description.match(new RegExp(`${prefix}\\s*(\\d+)`));
  return match ? parseInt(match[1], 10) : null;
};

const extractStringFromDescription = (description: string, prefix: string): string | null => {
  const match = description.match(new RegExp(`${prefix}\\s*([\\w]+)`));
  return match ? match[1] : null;
};

// Extended Tender type that includes blockchain-specific fields
interface ExtendedTender extends Tender {
  distance?: number;
  weight?: number;
  cargoType?: string;
  urgencyDays?: number;
  creator?: any;
  bidder?: string;
  expiresAt?: string;
  fromBlockchain?: boolean;
}

// Define ContractResponse interface locally
interface ContractResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
  hash?: string;
}

// Объединяет тендеры из базы данных и блокчейна
const mergeTenders = (dbTenders: any[], contractTenders: any[]): any[] => {
  const mergedTenders = [...dbTenders].map(dbTender => {
    // Проверяем, есть ли этот тендер в контракте (по ID)
    const contractTender = contractTenders.find(ct => ct.id === dbTender.id);
    
    if (contractTender) {
      // Если есть в контракте, используем данные из контракта, но сохраняем некоторые поля из БД
      return {
        ...dbTender,
        ...contractTender,
        // Эти поля оставляем из БД, так как они могут быть более детальными или удобными для UI
        title: contractTender.title || dbTender.title,
        description: contractTender.description || dbTender.description,
        // Явно указываем, что тендер из блокчейна, установив числовой ID
        fromBlockchain: true
      };
    }
    
    // Если нет в контракте, преобразуем формат для совместимости
    return {
      ...dbTender,
      distance: extractNumberFromDescription(dbTender.description, 'Расстояние:') || 0,
      weight: extractNumberFromDescription(dbTender.description, 'Вес:') || 0,
      cargoType: extractStringFromDescription(dbTender.description, 'Тип груза:') || 'general',
      urgencyDays: extractNumberFromDescription(dbTender.description, 'Срок доставки:') || 0,
      creator: dbTender.creator?.walletAddress || '',
      bidder: '',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // По умолчанию 10 минут
      fromBlockchain: false // Явно указываем, что тендер НЕ из блокчейна
    };
  });
  
  // Добавляем тендеры из контракта, которых нет в БД
  contractTenders.forEach(contractTender => {
    if (!dbTenders.some(dbTender => dbTender.id === contractTender.id)) {
      // Transform contract tender to match DB tender format
      mergedTenders.push({
        ...contractTender,
        creatorId: contractTender.creator,
        updatedAt: contractTender.createdAt, // Use createdAt as updatedAt since contract doesn't have updatedAt
        creator: {
          walletAddress: contractTender.creator
        },
        fromBlockchain: true // Явно указываем, что тендер из блокчейна
      });
    }
  });
  
  return mergedTenders;
};

// Generate mock tenders in case API/contract is unavailable
const getMockTenders = (): any[] => {
  return [
    {
      id: 'mock-1',
      title: 'Демо тендер #1',
      description: 'Расстояние: 1000 км, Вес: 500 кг, Тип груза: perishable, Срок доставки: 3 дня',
      budget: 1500,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      distance: 1000,
      weight: 500,
      cargoType: 'perishable',
      urgencyDays: 3,
      creator: '0x123456789abcdef',
      bidder: '',
      status: 'OPEN',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours instead of 10 minutes
      fromBlockchain: false
    },
    {
      id: 'mock-2',
      title: 'Демо тендер #2',
      description: 'Расстояние: 500 км, Вес: 1000 кг, Тип груза: general, Срок доставки: 5 дней',
      budget: 2000,
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      distance: 500,
      weight: 1000,
      cargoType: 'general',
      urgencyDays: 5,
      creator: '0x987654321fedcba',
      bidder: '',
      status: 'OPEN',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours instead of 10 minutes
      fromBlockchain: false
    }
  ];
};

export default function Dashboard() {
  const { account } = useWeb3();
  const tenderAPI = useTenderAPI();
  const contractTender = useContractTender();
  
  // Track contract availability separately with a ref to ensure stable comparisons
  const [isContractReady, setIsContractReady] = useState(false);
  const contractReadyRef = useRef(false);
  const lastContractCheckRef = useRef<number>(0);
  
  const [tenders, setTenders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadingRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'my' | 'available'>('all');
  const [timeLeftMap, setTimeLeftMap] = useState<Map<string, number | string>>(new Map());
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const hasAttemptedFetchRef = useRef(false);
  const [contractWarning, setContractWarning] = useState<string | null>(null);
  const [urgentTenders, setUrgentTenders] = useState<Map<string, boolean>>(new Map());
  const [directContractAttempted, setDirectContractAttempted] = useState(false);
  
  // Модальное окно для деталей тендера
  const [selectedTender, setSelectedTender] = useState<TenderDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Direct contract interaction attempt as a last resort
  const tryDirectContractAccess = useCallback(async () => {
    if (directContractAttempted) return false;
    
    console.log("Attempting direct contract access as last resort");
    setDirectContractAttempted(true);
    
    try {
      if (typeof window === 'undefined' || !window.ethereum) {
        console.warn("No window.ethereum available for direct access");
        return false;
      }
      
      const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      if (!CONTRACT_ADDRESS) {
        console.error("No contract address available");
        return false;
      }
      
      // Try to create provider and connect directly to contract
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send('eth_requestAccounts', []);
      
      if (!accounts || accounts.length === 0) {
        console.warn("No accounts available");
        return false;
      }
      
      const signer = await browserProvider.getSigner();
      console.log("Direct access - got signer with address:", await signer.getAddress());
      
      // ABI for TenderChain contract
      const abi = [
        "function getActiveTenders() public view returns (uint256[] memory)",
        "function getTender(uint256 _id) public view returns (uint256 id, string title, string description, uint256 budget, uint256 deadline, uint256 distance, uint256 weight, string cargoType, uint256 urgencyDays, address creator, address bidder, uint8 status, uint256 createdAt, uint256 expiresAt)"
      ];
      
      const directContract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
      
      // Try to get active tenders
      console.log("Direct access - calling getActiveTenders");
      const activeTenderIds = await directContract.getActiveTenders();
      console.log("Direct access - received tender IDs:", activeTenderIds);
      
      if (!activeTenderIds || activeTenderIds.length === 0) {
        console.log("Direct access - no active tenders found");
        return true; // Consider this a success as we confirmed connection works
      }
      
      // Process each tender
      const directTenders = await Promise.all(
        activeTenderIds.map(async (id: any) => {
          try {
            const tenderData = await directContract.getTender(id);
            return {
              id: tenderData.id.toString(),
              title: tenderData.title,
              description: tenderData.description,
              budget: parseFloat(ethers.formatEther(tenderData.budget)),
              deadline: new Date(tenderData.deadline * 1000).toISOString(),
              distance: tenderData.distance,
              weight: tenderData.weight,
              cargoType: tenderData.cargoType,
              urgencyDays: tenderData.urgencyDays,
              creator: tenderData.creator,
              bidder: tenderData.bidder,
              status: ['OPEN', 'CLOSED', 'AWARDED', 'COMPLETED', 'CANCELLED'][tenderData.status],
              createdAt: new Date(tenderData.createdAt * 1000).toISOString(),
              expiresAt: new Date(tenderData.expiresAt * 1000).toISOString(),
              fromBlockchain: true
            };
          } catch (err) {
            console.error(`Error fetching tender ${id} directly:`, err);
            return null;
          }
        })
      );
      
      // Filter out failed tenders
      const validTenders = directTenders.filter(tender => tender !== null);
      console.log("Direct access - successfully loaded tenders:", validTenders.length);
      
      if (validTenders.length > 0) {
        setTenders(validTenders);
        setError(null);
        setContractWarning("Смарт-контракт доступен через прямое подключение. Используем данные напрямую из блокчейна.");
        setIsLoading(false);
        isLoadingRef.current = false;
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Direct contract access failed:", error);
      return false;
    }
  }, [directContractAttempted]);
  
  // Мемоизированная функция для объединения тендеров
  const memoizedMergeTenders = useCallback(mergeTenders, []);
  
  // Мемоизированные ссылки на методы контракта
  const getActiveTendersMethod = useCallback(() => {
    return contractTender.getActiveTenders;
  }, [contractTender.getActiveTenders]);
  
  const isContractAvailableRef = useRef(contractTender.isContractAvailable);
  
  // Обновляем ref для стабильного сравнения
  useEffect(() => {
    isContractAvailableRef.current = contractTender.isContractAvailable;
  }, [contractTender.isContractAvailable]);
  
  // Force loading to be false after 10 seconds to prevent endless loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        console.log("Dashboard: Forcing loading to stop after timeout");
        
        // Try direct contract access as last resort before showing mocks
        tryDirectContractAccess().then(success => {
          if (!success) {
            setIsLoading(false);
            isLoadingRef.current = false;
            
            // If we haven't loaded any tenders, set some mock ones
            if (tenders.length === 0) {
              console.log("No tenders loaded, setting mock tenders");
              setTenders(getMockTenders());
              setContractWarning('Тайм-аут при загрузке данных. Показываем демо-тендеры.');
            }
          }
        });
      }
    }, 8000);
    
    return () => clearTimeout(timer);
  }, [isLoading, tenders, tryDirectContractAccess]);
  
  // Update refs when states change to avoid stale closures
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  
  useEffect(() => {
    hasAttemptedFetchRef.current = hasAttemptedFetch;
  }, [hasAttemptedFetch]);
  
  useEffect(() => {
    contractReadyRef.current = isContractReady;
  }, [isContractReady]);
  
  // Функция для загрузки тендеров из API и смарт-контракта
  const fetchTenders = useCallback(async (forceRefresh = false) => {
    if (isLoadingRef.current && !forceRefresh) {
      console.log("Already loading tenders, skipping fetchTenders call");
      return;
    }
    
    console.log('Fetching tenders, force refresh:', forceRefresh);
    setIsLoading(true);
    isLoadingRef.current = true;
    setError(null);
    setContractWarning(null);
    
    // Get current contract availability for consistent usage throughout function
    const contractAvailable = isContractAvailableRef.current;
    const getActiveTenders = getActiveTendersMethod();
    
    let apiError = false;
    let contractResponse: ContractResponse<ContractTender[]> = { 
      success: false, 
      data: undefined,
      error: undefined 
    };
    
    try {
      // Check network connectivity first
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn('Browser reports network is offline, using mock data');
        setContractWarning('Вы не подключены к интернету. Показываем локальные данные.');
        setTenders(getMockTenders());
        return;
      }
      
      // Пробуем получить тендеры из БД
      console.log('Fetching tenders from API...');
      let dbTenders: ExtendedTender[] = [];
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
        
        // Use API without signal parameter
        const response = await tenderAPI.getTenders();
        clearTimeout(timeoutId);
        
        if (response.data) {
          dbTenders = response.data as ExtendedTender[];
          console.log(`Loaded ${dbTenders.length} tenders from API`);
        } else {
          console.warn('API returned no tenders or error', response);
          apiError = true;
          
          if (response.error) {
            console.warn('API error:', response.error);
            if (response.error.includes('Failed to fetch') || 
                response.error.includes('network') || 
                response.error.includes('offline')) {
              setContractWarning('Проблема с подключением к серверу. Пробуем использовать локальные данные.');
            }
          }
        }
      } catch (apiErr) {
        console.warn('Error fetching from API:', apiErr);
        apiError = true;
      }
      
      // Пробуем получить тендеры из смарт-контракта только если он доступен
      let contractTenders: ContractTender[] = [];
      
      if (contractAvailable && getActiveTenders) {
        console.log('Fetching tenders from smart contract...');
        try {
          contractResponse = await getActiveTenders();
          
          if (contractResponse.success && Array.isArray(contractResponse.data)) {
            contractTenders = contractResponse.data.filter(Boolean) as ContractTender[]; // Filter out nulls
            console.log(`Loaded ${contractTenders.length} tenders from smart contract`);
          } else {
            console.warn('Contract returned no tenders or error', contractResponse);
          }
        } catch (contractErr) {
          console.error('Error fetching from contract:', contractErr);
        }
      } else {
        console.log('Smart contract not available, skipping blockchain fetch');
      }
      
      // Объединяем тендеры из обоих источников
      let allTenders: any[] = [];
      
      if (dbTenders.length > 0 && contractTenders.length > 0) {
        // Если есть данные и из БД, и из контракта
        allTenders = memoizedMergeTenders(dbTenders, contractTenders);
      } else if (dbTenders.length > 0) {
        // Если есть только данные из БД
        allTenders = dbTenders.map(tender => ({
          ...tender,
          distance: extractNumberFromDescription(tender.description, 'Расстояние:') || 0,
          weight: extractNumberFromDescription(tender.description, 'Вес:') || 0,
          cargoType: extractStringFromDescription(tender.description, 'Тип груза:') || 'general',
          urgencyDays: extractNumberFromDescription(tender.description, 'Срок доставки:') || 0,
          creator: tender.creator?.walletAddress || '',
          bidder: '',
          expiresAt: tender.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          fromBlockchain: false // Явно указываем, что тендер НЕ из блокчейна
        }));
      } else if (contractTenders.length > 0) {
        // Если есть только данные из контракта
        allTenders = contractTenders.map(tender => ({
          ...tender,
          fromBlockchain: true // Явно указываем, что тендер из блокчейна
        }));
      } else {
        // Если нет данных ни из БД, ни из контракта, используем демо-данные
        allTenders = getMockTenders();
        
        // Показываем предупреждение, если оно еще не установлено
        if (apiError && !contractAvailable) {
          setContractWarning('Не удалось получить данные ни из API, ни из смарт-контракта. Показываем демо-данные.');
        } else if (apiError) {
          setContractWarning('API недоступен. Показываем демо-тендеры.');
        } else if (!contractAvailable) {
          setContractWarning('Смарт-контракт недоступен. Показываем демо-тендеры.');
        } else {
          setContractWarning('Не удалось получить данные. Показываем демо-тендеры.');
        }
      }
      
      console.log('Loaded tenders:', { 
        dbCount: dbTenders.length, 
        contractCount: contractTenders.length, 
        totalCount: allTenders.length 
      });
      
      setTenders(allTenders);
    } catch (error) {
      console.error('Error fetching tenders:', error);
      setError('Ошибка при загрузке тендеров');
      // Показываем демо-данные в случае ошибки
      setTenders(getMockTenders());
    } finally {
      console.log("Fetch tenders completed, setting loading to false");
      setIsLoading(false);
      isLoadingRef.current = false;
      setHasAttemptedFetch(true);
      hasAttemptedFetchRef.current = true;
    }
  }, [
    tenderAPI, 
    getActiveTendersMethod, 
    memoizedMergeTenders, 
    extractNumberFromDescription, 
    extractStringFromDescription,
    getMockTenders
  ]);
  
  // Update contract ready state when contract availability changes
  useEffect(() => {
    const isAvailable = contractTender.isContractAvailable;
    const now = Date.now();
    
    // Debounce contract availability checks to prevent rapid switching
    if (now - lastContractCheckRef.current < 5000) {
      return;
    }
    
    lastContractCheckRef.current = now;
    
    // Only log and update if the value actually changed
    if (isAvailable !== isContractAvailableRef.current) {
      console.log("Dashboard detected contract availability change:", isAvailable);
      
      console.log("Setting contract ready state to:", isAvailable);
      setIsContractReady(isAvailable);
      isContractAvailableRef.current = isAvailable;
      
      // If contract became available and we've already attempted a fetch, do another one
      // Adding a delay to prevent rapid consecutive calls
      if (isAvailable && hasAttemptedFetchRef.current && !isLoadingRef.current) {
        console.log("Contract became available, scheduling refresh");
        const timerId = setTimeout(() => fetchTenders(true), 1500);
        return () => clearTimeout(timerId);
      }
    }
  }, [contractTender.isContractAvailable, fetchTenders]);
  
  // Re-fetch when contract state changes, but with debouncing
  useEffect(() => {
    // Skip this effect if we haven't attempted a fetch yet or are currently loading
    if (!hasAttemptedFetchRef.current || isLoadingRef.current) {
      return;
    }
    
    // Use a ref to track if this effect has already run for the current state
    const contractState = contractTender.isContractAvailable;
    if (contractState === isContractAvailableRef.current) {
      return;
    }
    
    // Update our ref for the next check
    isContractAvailableRef.current = contractState;
    
    // Add sufficient debounce to prevent hammering the blockchain
    const refreshTimer = setTimeout(() => {
      console.log('Contract state changed, refreshing data after delay');
      fetchTenders(true);
    }, 2000);
    
    return () => {
      clearTimeout(refreshTimer);
    };
  }, [contractTender.isContractAvailable, fetchTenders]);
  
  // Initial data load after component mount - with improved debouncing
  useEffect(() => {
    // Use a ref to track if this effect has already run
    if (hasAttemptedFetchRef.current) {
      return;
    }
    
    let isComponentMounted = true;
    console.log("Dashboard mounted, scheduling initial fetch");
    
    // Ensure we always do the initial fetch after a brief delay
    const timer = setTimeout(() => {
      if (!isComponentMounted) return;
      
      // Mark that we've attempted a fetch to prevent duplicate calls
      setHasAttemptedFetch(true);
      hasAttemptedFetchRef.current = true;
      
      console.log('Initial fetch timer triggered');
      
      // Update local tracking based on contract's current state
      const contractAvailable = contractTender.isContractAvailable;
      setIsContractReady(contractAvailable);
      contractReadyRef.current = contractAvailable;
      isContractAvailableRef.current = contractAvailable;
      
      try {
        fetchTenders(true);
      } catch (error) {
        console.error("Error during initial data fetch:", error);
        // Fall back to mock data in case of error
        setTenders(getMockTenders());
        setContractWarning('Возникла ошибка при загрузке данных. Показываем демо-тендеры.');
      }
    }, 1000);
    
    return () => {
      // Clean up timers and mark component as unmounted
      clearTimeout(timer);
      isComponentMounted = false;
    };
  }, [fetchTenders, contractTender.isContractAvailable, getMockTenders]);
  
  // Обновление таймеров
  useEffect(() => {
    // Функция для обновления таймеров всех тендеров
    const updateTimers = () => {
      if (!tenders.length) return;
      
      const now = Date.now();
      const newMap = new Map<string, number | string>();
      const urgentMap = new Map<string, boolean>();
      
      tenders.forEach(tender => {
        if (tender.expiresAt) {
          const expiresAt = new Date(tender.expiresAt).getTime();
          const diffSeconds = Math.floor((expiresAt - now) / 1000);
          
          if (diffSeconds > 0) {
            newMap.set(tender.id, diffSeconds);
            // Отмечаем как срочный, если осталось менее 5 минут
            urgentMap.set(tender.id, diffSeconds < 300);
          } else {
            newMap.set(tender.id, 'Истек');
            urgentMap.set(tender.id, false);
          }
        }
      });
      
      setTimeLeftMap(newMap);
      setUrgentTenders(urgentMap);
    };

    // Запускаем таймер для обновления каждую секунду
    updateTimers(); // Первый запуск
    const timer = setInterval(updateTimers, 1000);
    
    return () => clearInterval(timer);
  }, [tenders]);

  // Получаем отфильтрованные тендеры
  const filteredTenders = tenders.filter(tender => {
    if (filterMode === 'all') return true;
    
    // Make sure account exists before comparing
    if (!account) return false;
    
    const creatorAddress = typeof tender.creator === 'string' 
      ? tender.creator.toLowerCase() 
      : tender.creator?.walletAddress?.toLowerCase?.();
    
    if (filterMode === 'my' && creatorAddress) {
      return creatorAddress === account.toLowerCase();
    }
    
    if (filterMode === 'available') {
      return (
        creatorAddress !== account.toLowerCase() && 
        tender.status === 'OPEN' &&
        (!tender.expiresAt || new Date(tender.expiresAt) > new Date())
      );
    }
    
    return false;
  });

  // Функция для отображения деталей тендера
  const showTenderDetails = (tender: any) => {
    // Подготовка данных тендера для отображения в модальном окне
    const tenderDetails: TenderDetails = {
      id: tender.id,
      title: tender.title,
      description: tender.description,
      budget: tender.budget,
      deadline: tender.deadline,
      status: tender.status,
      createdAt: tender.createdAt,
      expiresAt: tender.expiresAt,
      distance: tender.distance,
      weight: tender.weight,
      cargoType: tender.cargoType,
      urgencyDays: tender.urgencyDays,
      creator: tender.creator?.walletAddress || tender.creator,
      timeLeft: timeLeftMap.get(tender.id)?.toString() || '',
      fromBlockchain: tender.fromBlockchain
    };
    
    setSelectedTender(tenderDetails);
    setIsModalOpen(true);
  };

  // Компонент для отображения тендера в интерфейсе
  const renderTender = (tender: any) => {
    // Определяем классы для статуса тендера
    const statusClasses = 
      tender.status === 'OPEN' ? 'bg-green-100 text-green-800' : 
      tender.status === 'AWARDED' ? 'bg-blue-100 text-blue-800' : 
      tender.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' : 
      tender.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 
      'bg-gray-100 text-gray-800';
    
    // Определяем текст статуса
    const statusText = 
      tender.status === 'OPEN' ? 'Открыт' : 
      tender.status === 'AWARDED' ? 'Присужден' : 
      tender.status === 'COMPLETED' ? 'Завершен' : 
      tender.status === 'CANCELLED' ? 'Отменен' : 'Закрыт';

    // Добавляем кнопку быстрого просмотра
    return (
      <div key={tender.id} className="bg-white rounded-lg shadow-md p-4 mb-4 hover:shadow-lg transition-shadow">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-semibold">{tender.title}</h3>
          <div className={`text-xs font-medium px-2.5 py-0.5 rounded ${statusClasses}`}>
            {statusText}
          </div>
        </div>
        
        <p className="text-gray-700 mb-3">
          {tender.description.length > 100 
            ? `${tender.description.substring(0, 100)}...` 
            : tender.description}
        </p>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">Бюджет:</p>
            <p className="font-bold text-green-600">${tender.budget}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Расстояние:</p>
            <p className="font-medium">{tender.distance || 'Не указано'} км</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Вес груза:</p>
            <p className="font-medium">{tender.weight || 'Не указано'} кг</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Срок доставки:</p>
            <p className="font-medium">{tender.urgencyDays || 'Не указано'} дней</p>
          </div>
        </div>
        
        {tender.status === 'OPEN' && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md p-2">
            <p className="text-yellow-800 text-sm">
              Осталось: <span className="font-bold">{timeLeftMap.get(tender.id) || 'Н/Д'}</span>
            </p>
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Создатель: {tender.creator?.walletAddress?.slice(0, 6) || tender.creator?.slice(0, 6)}...
            {tender.creator?.walletAddress?.slice(-4) || tender.creator?.slice(-4)}
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => showTenderDetails(tender)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Подробнее
            </button>
            
            {tender.status === 'OPEN' && (
              <button 
                onClick={() => showTenderDetails(tender)}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                Участвовать
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Ошибка!</strong>
            <span className="block sm:inline"> {error}</span>
            <div className="mt-2 text-sm">
              <p className="font-bold">Возможные решения:</p>
              <ul className="list-disc pl-5 mt-1">
                <li>Убедитесь, что API-сервер запущен и доступен</li>
                <li>Проверьте сетевое соединение</li>
                <li>Убедитесь, что URL API указан верно в .env файле</li>
                <li>Попробуйте перезагрузить страницу</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Доступные тендеры</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {contractWarning && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
            {contractWarning}
          </div>
        )}
        
        {/* Отладочная информация */}
        <div className="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded mb-4 text-xs">
          <h3 className="font-bold">Отладочная информация:</h3>
          <p>Адрес контракта: {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}</p>
          <p>Кошелек подключен: {account ? 'Да' : 'Нет'}</p>
          <p>Доступность контракта: {contractTender.isContractAvailable ? 'Доступен' : 'Недоступен'}</p>
          <p>Статус контракта: {contractTender.contractStatus}</p>
          <p>Ошибка контракта: {contractTender.error || 'Нет'}</p>
          {contractTender.contractErrorDetails && (
            <p>Детали ошибки: {contractTender.contractErrorDetails}</p>
          )}
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => contractTender.forceContractInitialization()}
              className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none"
            >
              Переподключиться к контракту
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 focus:outline-none"
            >
              Обновить страницу
            </button>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold text-gray-900">Тендеры</h1>
            <button 
              onClick={() => fetchTenders(true)} 
              className="ml-3 p-2 rounded-full hover:bg-gray-200 transition-colors"
              title="Обновить"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
          </div>

          <div className="flex space-x-2 items-center">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="flex divide-x">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-4 py-2 ${filterMode === 'all' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
                >
                  Все
                </button>
                <button
                  onClick={() => setFilterMode('my')}
                  className={`px-4 py-2 ${filterMode === 'my' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
                >
                  Мои
                </button>
                <button 
                  onClick={() => setFilterMode('available')}
                  className={`px-4 py-2 ${filterMode === 'available' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
                >
                  Доступные
                </button>
              </div>
            </div>
            
            <Link
              href="/tender/create"
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Создать тендер
            </Link>
          </div>
        </div>

        {filteredTenders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {filterMode === 'all' ? 'Нет активных тендеров' : 
               filterMode === 'my' ? 'У вас нет созданных тендеров' : 
               'Нет доступных тендеров'}
            </p>
            <Link
              href="/tender/create"
              className="text-blue-500 hover:text-blue-600 mt-4 inline-block"
            >
              Создать новый тендер
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTenders.map(renderTender)}
          </div>
        )}
      </div>
      
      {/* Модальное окно для просмотра деталей тендера */}
      {selectedTender && (
        <TenderModal
          tender={selectedTender}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onBidSubmitted={() => fetchTenders(true)}
        />
      )}
    </div>
  );
}