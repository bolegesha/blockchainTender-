import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWeb3 } from './useWeb3';
import { ethers } from 'ethers';
import { debounce } from 'lodash';
import { Contract, Signer, Provider, BigNumberish, getBigInt } from 'ethers';

// Import the generated ABI
import TenderChainABI from '../abi/TenderChain.json';

// Local type definition for TenderStatus to avoid dependency issues
export type TenderStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'COMPLETED' | 'CANCELLED';

// Fallback ABI in case the import fails
const FALLBACK_ABI = [
  // Main functions
  "function createTender(string _title, string _description, uint256 _budget, uint256 _deadline, uint256 _distance, uint256 _weight, string _cargoType, uint256 _urgencyDays, uint256 _expirationMinutes) public returns (uint256)",
  "function getTender(uint256 _id) public view returns (uint256 id, string title, string description, uint256 budget, uint256 deadline, uint256 distance, uint256 weight, string cargoType, uint256 urgencyDays, address creator, address bidder, uint8 status, uint256 createdAt, uint256 expiresAt)",
  "function getActiveTenders() public view returns (uint256[] memory)",
  "function takeTender(uint256 _id) public",
  "function completeTender(uint256 _id) public",
  "function cancelTender(uint256 _id) public",
  
  // State variables
  "function tenderCount() public view returns (uint256)",
  "function tenders(uint256) public view returns (uint256 id, string title, string description, uint256 budget, uint256 deadline, uint256 distance, uint256 weight, string cargoType, uint256 urgencyDays, address creator, address bidder, uint8 status, uint256 createdAt, uint256 expiresAt)",
  
  // Events
  "event TenderCreated(uint256 indexed id, string title, uint256 budget, address indexed creator, uint256 expiresAt)",
  "event TenderTaken(uint256 indexed id, address indexed bidder, uint256 timestamp)",
  "event TenderCompleted(uint256 indexed id, address indexed bidder, uint256 timestamp)",
  "event TenderCancelled(uint256 indexed id, address indexed creator, uint256 timestamp)"
];

// Use the imported ABI if available, otherwise use the fallback
const ABI = TenderChainABI?.abi || FALLBACK_ABI;

// Адрес контракта
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
// Добавляем дополнительное логирование для отладки
console.log("Contract address from ENV:", CONTRACT_ADDRESS);

// Улучшенная функция для инициализации контракта
const MAX_INIT_ATTEMPTS = 5;
const INIT_RETRY_DELAY = 2000; // ms

export interface ContractTender {
  id: string;
  title: string;
  description: string;
  budget: BigNumberish;
  deadline: BigNumberish;
  distance: number;
  weight: number;
  cargoType: string;
  urgencyDays: number;
  creator: string;
  bidder: string;
  status: TenderStatus;
  createdAt: string;
  expiresAt: string;
  timeLeft?: number; // время до истечения срока в секундах
  categories?: Array<string | { id: string; name: string }>; // Добавляем поле категорий
}

interface ContractResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
  hash?: string;
}

// Helper function to extract error messages from various error types
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
};

// Add TypeScript interface for function with lastCallTime property
interface GetActiveTendersFunction extends Function {
  lastCallTime?: number;
}

// Helper function to handle contract errors
const handleContractError = <T>(error: any, defaultValue: T): ContractResponse<T> => {
  console.error('Contract error:', error);
  return {
    success: false,
    error: error?.message || error?.reason || 'Unknown contract error',
    data: defaultValue
  };
};

export default function useContractTender() {
  // All state hooks must be called unconditionally at the top level
  const { provider, signer, account } = useWeb3();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContractAvailable, setIsContractAvailable] = useState(false);

  // Use refs to safely track values across renders
  const contractRef = useRef<Contract | null>(null);
  const isContractAvailableRef = useRef(isContractAvailable);
  
  // Track last call time for debouncing
  const lastGetActiveTendersCall = useRef<number>(0);
  const isLoadingTenders = useRef<boolean>(false);
  const initAttempts = useRef<number>(0);
  
  // Улучшенная проверка подключения напрямую через window.ethereum
  const forceContractInitialization = useCallback(async () => {
    console.log("🔄 Forcing contract initialization");
    
    if (!CONTRACT_ADDRESS) {
      console.error("❌ No contract address provided");
      return false;
    }
    
    try {
      console.log("🔄 Checking window.ethereum availability");
      // Try using window.ethereum directly if available
      if (typeof window !== "undefined" && window.ethereum) {
        console.log("✅ window.ethereum is available");
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        
        try {
          const signer = await browserProvider.getSigner();
          const signerAddress = await signer.getAddress();
          console.log("✅ Got signer with address:", signerAddress);
          
          console.log("🔄 Creating direct contract connection to:", CONTRACT_ADDRESS);
          const directContract = new Contract(CONTRACT_ADDRESS, ABI, signer);
          
          // Try a simple view call
          console.log("🔄 Testing contract with direct call to tenderCount()");
          const count = await directContract.tenderCount();
          console.log("✅ Direct contract call succeeded! Tender count:", count.toString());
          
          // If we got here, the contract is available and working
          setIsContractAvailable(true);
          isContractAvailableRef.current = true;
          
          setContract(directContract);
          contractRef.current = directContract;
          
          console.log("✅ Contract initialized successfully with direct method");
          return true;
        } catch (error) {
          console.error("❌ Failed to get signer or execute contract call:", error);
          return false;
        }
      } else {
        console.warn("⚠️ No window.ethereum available for direct check");
        return false;
      }
    } catch (error) {
      console.error("❌ Direct contract connection test failed:", error);
      return false;
    }
  }, []);
  
  // Manual direct contract check function
  const testContractConnection = useCallback(async () => {
    console.log("Performing direct contract connection test");
    
    if (!CONTRACT_ADDRESS) {
      console.error("No contract address provided");
      return false;
    }
    
    try {
      // Try using window.ethereum directly if available
      if (typeof window !== "undefined" && window.ethereum) {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const signer = await browserProvider.getSigner();
        console.log("Got signer with address:", await signer.getAddress());
        
        console.log("Creating direct contract connection to:", CONTRACT_ADDRESS);
        const directContract = new Contract(CONTRACT_ADDRESS, ABI, signer);
        
        // Try a simple view call
        console.log("Testing contract with direct call to tenderCount()");
        const count = await directContract.tenderCount();
        console.log("Direct contract call succeeded! Tender count:", count.toString());
        
        // If we got here, the contract is available and working
        if (!isContractAvailable) {
          setIsContractAvailable(true);
          isContractAvailableRef.current = true;
        }
        
        if (!contract) {
          setContract(directContract);
          contractRef.current = directContract;
        }
        
        return true;
      } else {
        console.warn("No window.ethereum available for direct check");
        return false;
      }
    } catch (error) {
      console.error("Direct contract connection test failed:", error);
      return false;
    }
  }, [CONTRACT_ADDRESS, contract, isContractAvailable]);
  
  // Запуск принудительной инициализации при изменении аккаунта
  useEffect(() => {
    if (account) {
      console.log("Account changed or connected, attempting forced contract initialization");
      forceContractInitialization();
    }
  }, [account, forceContractInitialization]);
  
  // Улучшенная проверка контракта в useEffect
  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    
    const checkContractWithRetry = async () => {
      if (!isMounted) return;
      
      console.log(`Contract check attempt ${retryCount + 1}/${MAX_INIT_ATTEMPTS}`);
      
      // Выход, если контракт уже доступен
      if (isContractAvailable && contract) {
        console.log("Contract already available, skipping check");
        return;
      }
      
      // Проверка, есть ли доступный аккаунт
      if (account) {
        const success = await forceContractInitialization();
        
        if (success) {
          console.log("Contract initialization successful");
          return;
        }
      }
      
      // Если мы дошли до этой точки, значит инициализация не удалась
      retryCount++;
      
      if (retryCount < MAX_INIT_ATTEMPTS) {
        console.log(`Will retry contract check in ${INIT_RETRY_DELAY}ms`);
        setTimeout(checkContractWithRetry, INIT_RETRY_DELAY);
      } else {
        console.log("Maximum contract check attempts reached");
      }
    };
    
    // Запускаем первую проверку
    checkContractWithRetry();
    
    return () => {
      isMounted = false;
    };
  }, [account, contract, isContractAvailable, forceContractInitialization]);

  // Get stable account reference
  const signerAddress = useMemo(async () => {
    if (!signer) return null;
    try {
      return await signer.getAddress();
    } catch (error) {
      console.error("Error getting signer address:", error);
      return null;
    }
  }, [signer]);
  
  // Create a non-async version for useEffect dependencies
  const [signerAddressStr, setSignerAddressStr] = useState<string | null>(null);
  
  // Update signerAddressStr when signerAddress promise resolves
  useEffect(() => {
    if (signer) {
      signer.getAddress()
        .then(address => {
          setSignerAddressStr(address);
        })
        .catch(error => {
          console.error("Failed to get signer address:", error);
          setSignerAddressStr(null);
        });
    } else {
      setSignerAddressStr(null);
    }
  }, [signer]);

  // Store previous signer reference to prevent unnecessary reconnections
  const previousSignerRef = useRef<string | null>(null);
  
  // Create stable checks that can be used in dependencies
  const contractAvailable = useCallback(() => {
    return !!contractRef.current && isContractAvailableRef.current;
  }, []);

  // Common error check for all contract methods
  const checkContractAvailability = useCallback(() => {
    if (!contractRef.current) {
      return { available: false, error: 'Contract not initialized' as string };
    }

    if (!isContractAvailableRef.current) {
      return { available: false, error: 'Contract is not properly deployed or accessible' as string };
    }

    return { available: true, error: undefined as string | undefined };
  }, []);

  // Общедоступная функция для проверки статуса контракта
  const checkContractStatus = useCallback(async () => {
    console.log("Manual contract status check requested");
    return forceContractInitialization();
  }, [forceContractInitialization]);

  // Создание нового тендера
  const createTender = useCallback(async (
    title: string,
    description: string,
    budget: BigNumberish,
    deadline: BigNumberish,
    distanceKm?: BigNumberish,
    weightKg?: BigNumberish,
    cargoType?: string,
    urgencyDays?: BigNumberish,
    expirationMinutes: number = 10 // по умолчанию тендер действует 10 минут
  ): Promise<ContractResponse<{ id: string }>> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    if (!signer) {
      return { success: false, error: 'Wallet not connected' };
    }

    setLoading(true);
    setError(null);

    try {
      // For ethers v6, convert BigNumberish to number safely
      const deadlineTimestamp = Number(getBigInt(deadline)) * 1000;
      
      const tx = await contractRef.current!.createTender(
        title,
        description,
        budget,
        deadlineTimestamp,
        distanceKm,
        weightKg,
        cargoType,
        urgencyDays,
        expirationMinutes
      );

      const receipt = await tx.wait();
      
      // Получаем ID созданного тендера из события
      const event = receipt.logs
        ?.filter((log: any) => log.fragment?.name === 'TenderCreated')
        ?.[0];
      
      let tenderId;
      if (event && event.args) {
        tenderId = event.args[0].toString();
      } else {
        tenderId = 'fallback-id-' + Date.now();
      }

      return {
        success: true,
        data: { id: tenderId },
        hash: receipt.transactionHash
      };
    } catch (err: any) {
      setError(err.message || 'Failed to create tender');
      return { success: false, error: err.message || 'Failed to create tender' };
    } finally {
      setLoading(false);
    }
  }, [contractRef, signer, checkContractAvailability]);

  // Получение тендера по ID
  const getTender = useCallback(async (id: string): Promise<ContractResponse<ContractTender>> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    setLoading(true);
    setError(null);

    try {
      // Проверяем, является ли ID числом или может быть преобразовано в число
      const isNumericId = /^\d+$/.test(id);
      
      if (!isNumericId) {
        console.warn('Non-numeric ID provided:', id);
        return { 
          success: false, 
          error: 'Тендер не найден в блокчейне. Возможно, это тендер только из базы данных.' 
        };
      }
      
      const tenderData = await contractRef.current!.getTender(id);
      
      // Преобразование из массива в объект
      const tender: ContractTender = {
        id: tenderData.id.toString(),
        title: tenderData.title,
        description: tenderData.description,
        budget: tenderData.budget,
        deadline: tenderData.deadline,
        distance: tenderData.distance.toNumber(),
        weight: tenderData.weight.toNumber(),
        cargoType: tenderData.cargoType,
        urgencyDays: tenderData.urgencyDays.toNumber(),
        creator: tenderData.creator,
        bidder: tenderData.bidder,
        status: ['OPEN', 'CLOSED', 'AWARDED', 'COMPLETED', 'CANCELLED'][tenderData.status] as any,
        createdAt: new Date(tenderData.createdAt.toNumber() * 1000).toISOString(),
        expiresAt: new Date(tenderData.expiresAt.toNumber() * 1000).toISOString()
      };

      // Добавление времени до истечения срока
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = Math.floor(new Date(tender.expiresAt).getTime() / 1000);
      tender.timeLeft = expiresAt > now ? expiresAt - now : 0;

      return { success: true, data: tender };
    } catch (err: any) {
      console.error('Error getting tender:', err);
      setError(err.message || 'Failed to get tender');
      return { success: false, error: err.message || 'Failed to get tender' };
    } finally {
      setLoading(false);
    }
  }, [contractRef, checkContractAvailability]);

  // Функция получения активных тендеров
  const getActiveTenders = useCallback(async (): Promise<ContractResponse<ContractTender[]>> => {
    const now = Date.now();
    console.log(`[getActiveTenders] Called at ${new Date(now).toISOString()}`);
    console.log(`[getActiveTenders] Last call was ${now - lastGetActiveTendersCall.current}ms ago`);
    console.log(`[getActiveTenders] IsLoadingTenders: ${isLoadingTenders.current}`);
    console.log(`[getActiveTenders] Contract available: ${isContractAvailable}, Contract ref: ${!!contractRef.current}`);
    
    // Implement proper debouncing
    if (now - lastGetActiveTendersCall.current < 3000) {
      console.log("[getActiveTenders] ⚠️ Debouncing - too soon after last call");
      return {
        success: false,
        error: "Rate limited. Please wait before trying again.",
        data: []
      };
    }
    
    // Check if we're already fetching
    if (isLoadingTenders.current) {
      console.log("[getActiveTenders] ⚠️ Already fetching, skipping duplicate call");
      return {
        success: false, 
        error: "Request already in progress",
        data: []
      };
    }
    
    // Track this request
    console.log("[getActiveTenders] ✅ Starting request");
    isLoadingTenders.current = true;
    lastGetActiveTendersCall.current = now;
    setLoading(true);
    
    // Check contract availability before proceeding
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      console.log(`[getActiveTenders] ❌ Contract not available: ${availabilityError}`);
      isLoadingTenders.current = false;
      setLoading(false);
      return {
        success: false,
        error: availabilityError || "Contract not available",
        data: []
      };
    }
    
    try {
      // Create a timeout promise
      console.log("[getActiveTenders] Setting up timeout promise");
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout fetching active tenders")), 15000);
      });
      
      // Race the contract call against the timeout
      console.log("[getActiveTenders] Making contract call");
      const activeTenderIds = await Promise.race([
        contractRef.current!.getActiveTenders(),
        timeoutPromise
      ]);
      
      console.log(`[getActiveTenders] Received ${activeTenderIds?.length || 0} tender IDs`);
      
      if (!activeTenderIds || activeTenderIds.length === 0) {
        console.log("[getActiveTenders] No active tenders found");
        isLoadingTenders.current = false;
        setLoading(false);
        return {
          success: true,
          data: []
        };
      }
      
      console.log(`[getActiveTenders] Fetching details for ${activeTenderIds.length} tenders`);
      const tenderPromises = activeTenderIds
        .filter((id: any) => id !== null && id !== undefined)
        .map((id: BigNumberish) => {
          const idString = id.toString();
          console.log(`[getActiveTenders] Fetching tender ${idString}`);
          return contractRef.current!.getTender(idString);
        });
      
      const tendersData = await Promise.all(tenderPromises);
      console.log(`[getActiveTenders] Received ${tendersData.length} tender details`);
      
      const tenders: ContractTender[] = tendersData.map((tenderData: any) => {
        console.log(`[getActiveTenders] Processing tender ${tenderData.id.toString()}`);
        return {
          id: tenderData.id.toString(),
          title: tenderData.title,
          description: tenderData.description,
          budget: tenderData.budget,
          deadline: tenderData.deadline,
          distance: Number(tenderData.distance),
          weight: Number(tenderData.weight),
          cargoType: tenderData.cargoType,
          urgencyDays: Number(tenderData.urgencyDays),
          creator: tenderData.creator,
          bidder: tenderData.bidder,
          status: ['OPEN', 'CLOSED', 'AWARDED', 'COMPLETED', 'CANCELLED'][Number(tenderData.status)] as TenderStatus,
          createdAt: new Date(Number(tenderData.createdAt) * 1000).toISOString(),
          expiresAt: new Date(Number(tenderData.expiresAt) * 1000).toISOString()
        };
      });
      
      // Добавление времени до истечения срока
      const currentTime = Math.floor(Date.now() / 1000);
      tenders.forEach(tender => {
        const expiresAt = Math.floor(new Date(tender.expiresAt).getTime() / 1000);
        tender.timeLeft = expiresAt > currentTime ? expiresAt - currentTime : 0;
      });
      
      console.log(`[getActiveTenders] ✅ Completed successfully with ${tenders.length} tenders`);
      return { success: true, data: tenders };
    } catch (err: any) {
      console.error('[getActiveTenders] ❌ Error:', err);
      setError(err.message || 'Failed to get active tenders');
      return { 
        success: false, 
        error: err.message || 'Failed to get active tenders',
        data: [] 
      };
    } finally {
      console.log("[getActiveTenders] Request complete, cleaning up");
      isLoadingTenders.current = false;
      setLoading(false);
    }
  }, [contractRef, checkContractAvailability]);

  // "Забрать" тендер
  const takeTender = useCallback(async (id: string): Promise<ContractResponse<void>> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    if (!signer) {
      return { success: false, error: 'Wallet not connected' };
    }

    setLoading(true);
    setError(null);

    try {
      const tx = await contractRef.current!.takeTender(id);
      const receipt = await tx.wait();

      return {
        success: true,
        hash: receipt.transactionHash
      };
    } catch (err: any) {
      console.error('Error taking tender:', err);
      setError(err.message || 'Failed to take tender');
      return { success: false, error: err.message || 'Failed to take tender' };
    } finally {
      setLoading(false);
    }
  }, [contractRef, signer, checkContractAvailability]);

  // Подать заявку на тендер (используя функцию takeTender)
  const submitBid = useCallback(async (
    id: string, 
    bidAmount: number, 
    bidDetails: string
  ): Promise<ContractResponse<{ id: string; amount: number; details: string }>> => {
    console.log("🚀 Starting submitBid function with:", { id, bidAmount, bidDetails });
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      console.error("❌ Contract not available:", availabilityError);
      return { success: false, error: availabilityError };
    }

    if (!signer) {
      console.error("❌ No signer available (wallet not connected)");
      return { success: false, error: 'Wallet not connected' };
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`📝 Submitting bid for tender ${id} with amount ${bidAmount} and details: ${bidDetails}`);
      
      // Убедимся, что ID тендера - это число
      let tenderId: number;
      try {
        tenderId = parseInt(id, 10);
        if (isNaN(tenderId)) {
          throw new Error(`Invalid tender ID: ${id} is not a number`);
        }
        console.log(`🔢 Converted ID to number: ${tenderId}`);
      } catch (error) {
        console.error(`❌ Failed to convert ID to number: ${id}`, error);
        return { success: false, error: `Invalid tender ID: ${id} (must be a number)` };
      }
      
      // Проверяем наличие контракта
      if (!contractRef.current) {
        throw new Error("Contract reference is not initialized");
      }
      
      console.log("📋 Contract ready, preparing transaction for takeTender:", { tenderId });
      
      // Проверяем наличие метода takeTender в контракте
      if (typeof contractRef.current.takeTender !== 'function') {
        console.error("❌ Contract does not have takeTender method!");
        return { success: false, error: "Contract interface error: takeTender method not found" };
      }
      
      // Отправляем транзакцию, используя функцию takeTender вместо submitBid
      console.log(`🔄 Calling takeTender on contract with id: ${tenderId}`);
      
      // Вызываем метод контракта
      const tx = await contractRef.current.takeTender(tenderId);
      
      console.log('✅ Transaction submitted, hash:', tx.hash);
      console.log('⏳ Waiting for confirmation...');
      
      // Ждем подтверждения транзакции
      const receipt = await tx.wait(1); // Ждем 1 подтверждение
      console.log('🎉 Transaction confirmed!', receipt);

      return {
        success: true,
        data: { 
          id: tenderId.toString(),
          amount: bidAmount,
          details: bidDetails
        },
        hash: receipt.transactionHash
      };
    } catch (err: any) {
      console.error('❌ Error submitting bid:', err);
      
      // Create more detailed error messages
      let errorMessage = 'Failed to submit bid';
      
      if (err.message) {
        if (err.message.includes('user rejected')) {
          errorMessage = 'Transaction was rejected by user';
        } else if (err.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds to complete the transaction';
        } else if (err.message.includes('execution reverted')) {
          // Extract revert reason if possible
          const match = err.message.match(/reason="([^"]+)"/);
          errorMessage = match ? match[1] : 'Transaction failed: execution reverted';
        } else {
          errorMessage = err.message;
        }
      }
      
      // Подробный лог ошибки с дополнительной информацией
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        error: err
      });
      
      setError(errorMessage);
      return { 
        success: false, 
        error: errorMessage,
        hash: err.transactionHash // Include tx hash even if failed, if available
      };
    } finally {
      setLoading(false);
    }
  }, [contractRef, signer, checkContractAvailability]);

  // Получить все заявки на тендер
  const getBidsForTender = useCallback(async (id: string): Promise<ContractResponse<{ id: string; bidder: string; amount: number; timestamp: string; status: string }[]>> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    setLoading(true);
    setError(null);

    try {
      // Получаем массив заявок из контракта
      const bids = await contractRef.current!.getBidsForTender(id);
      
      // Преобразуем данные в удобный формат
      const formattedBids = bids.map((bid: any) => ({
        id: bid.id?.toString() || '',
        bidder: bid.bidder,
        amount: parseFloat(ethers.formatEther(bid.amount)),
        timestamp: new Date(bid.timestamp.toNumber() * 1000).toISOString(),
        status: ['PENDING', 'ACCEPTED', 'REJECTED'][bid.status] || 'PENDING'
      }));

      return {
        success: true,
        data: formattedBids
      };
    } catch (err: any) {
      console.error('Error getting bids for tender:', err);
      setError(err.message || 'Failed to get bids');
      return { success: false, error: err.message || 'Failed to get bids' };
    } finally {
      setLoading(false);
    }
  }, [contractRef, checkContractAvailability]);

  // Завершить тендер
  const completeTender = useCallback(async (id: string): Promise<ContractResponse<void>> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    if (!signer) {
      return { success: false, error: 'Wallet not connected' };
    }

    setLoading(true);
    setError(null);

    try {
      const tx = await contractRef.current!.completeTender(id);
      const receipt = await tx.wait();

      return {
        success: true,
        hash: receipt.transactionHash
      };
    } catch (err: any) {
      console.error('Error completing tender:', err);
      setError(err.message || 'Failed to complete tender');
      return { success: false, error: err.message || 'Failed to complete tender' };
    } finally {
      setLoading(false);
    }
  }, [contractRef, signer, checkContractAvailability]);

  // Отменить тендер
  const cancelTender = useCallback(async (id: string): Promise<ContractResponse<void>> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    if (!signer) {
      return { success: false, error: 'Wallet not connected' };
    }

    setLoading(true);
    setError(null);

    try {
      const tx = await contractRef.current!.cancelTender(id);
      const receipt = await tx.wait();

      return {
        success: true,
        hash: receipt.transactionHash
      };
    } catch (err: any) {
      console.error('Error cancelling tender:', err);
      setError(err.message || 'Failed to cancel tender');
      return { success: false, error: err.message || 'Failed to cancel tender' };
    } finally {
      setLoading(false);
    }
  }, [contractRef, signer, checkContractAvailability]);

  const adaptTenderFromBlockchain = (tenderData: any, id: string): ContractTender => {
    try {
      if (!tenderData) {
        throw new Error('Tender data is undefined');
      }
      
      // Map numeric status to TenderStatus type
      const statusMap: TenderStatus[] = ['OPEN', 'CLOSED', 'AWARDED', 'COMPLETED', 'CANCELLED'];
      const status = statusMap[Number(tenderData.status)] || 'OPEN';
      
      // Convert ethers BigNumber values to regular numbers
      const adaptedTender: ContractTender = {
        id: id,
        title: tenderData.title,
        description: tenderData.description,
        budget: ethers.formatEther(tenderData.budget),
        deadline: new Date(Number(tenderData.deadline) * 1000).toISOString(),
        creator: tenderData.creator,
        bidder: tenderData.bidder,
        status: status, // Now properly typed as TenderStatus
        distance: Number(tenderData.distance),
        weight: Number(tenderData.weight),
        cargoType: tenderData.cargoType,
        urgencyDays: Number(tenderData.urgencyDays),
        createdAt: new Date(Number(tenderData.createdAt) * 1000).toISOString(),
        expiresAt: new Date(Number(tenderData.expiresAt) * 1000).toISOString(),
      };
      
      return adaptedTender;
    } catch (error: any) {
      console.error('Error adapting tender data:', error, tenderData);
      throw new Error(`Failed to adapt tender data: ${error.message}`);
    }
  };

  return {
    loading,
    error,
    isContractAvailable,
    createTender,
    getTender,
    getActiveTenders,
    takeTender,
    completeTender,
    cancelTender,
    submitBid,
    getBidsForTender,
    checkContractStatus
  };
} 