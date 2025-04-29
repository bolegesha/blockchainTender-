import { useState, useCallback, useEffect, useRef, useMemo, SetStateAction } from 'react';
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
  "function submitBid(uint256 _id, string _proposal) public payable",
  "function completeTender(uint256 _id) public",
  "function cancelTender(uint256 _id) public",
  
  // State variables
  "function tenderCount() public view returns (uint256)",
  "function tenders(uint256) public view returns (uint256 id, string title, string description, uint256 budget, uint256 deadline, uint256 distance, uint256 weight, string cargoType, uint256 urgencyDays, address creator, address bidder, uint8 status, uint256 createdAt, uint256 expiresAt)",
  
  // Events
  "event TenderCreated(uint256 indexed id, string title, uint256 budget, address indexed creator, uint256 expiresAt)",
  "event TenderTaken(uint256 indexed id, address indexed bidder, uint256 timestamp)",
  "event BidSubmitted(uint256 indexed id, address indexed bidder, string proposal, uint256 amount, uint256 timestamp)",
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

// Helper function to check if contract address has deployed code
async function verifyContractAddress(address: string, provider: Provider): Promise<boolean> {
  try {
    console.log(`🔍 Verifying contract at address: ${address}`);
    
    // Check if address is valid
    if (!ethers.isAddress(address)) {
      console.error('❌ Invalid address format:', address);
      return false;
    }
    
    // Check if contract has code
    const code = await provider.getCode(address);
    
    // If there's no code at this address, it's not a contract
    if (code === '0x' || code === '0x0') {
      console.error('❌ No contract deployed at this address (empty bytecode)');
      return false;
    }
    
    console.log(`✅ Contract found at ${address} with bytecode length: ${(code.length - 2) / 2} bytes`);
    return true;
  } catch (error) {
    console.error('❌ Error verifying contract address:', error);
    return false;
  }
}

// Helper function to validate ABI contains expected methods
function validateContractABI(abi: any[]): boolean {
  try {
    console.log('🔍 Validating contract ABI structure...');
    
    // Essential methods that should exist in the contract - update to match the actual contract
    const requiredMethods = ['tenderCount', 'createTender', 'getTender'];
    const optionalMethods = ['submitBid', 'getBidsForTender', 'takeTender', 'getActiveTenders'];
    
    // Check if ABI is an array
    if (!Array.isArray(abi)) {
      console.error('❌ ABI is not an array:', abi);
      return false;
    }
    
    // Extract function names from ABI
    const methodNames = abi
      .filter(item => item.type === 'function' || (typeof item === 'string' && item.includes('function')))
      .map(item => {
        if (typeof item === 'string') {
          // Извлекаем имя функции из строки вида "function name(...)"
          const match = item.match(/function\s+([a-zA-Z0-9_]+)/);
          return match ? match[1] : '';
        }
        return item.name;
      })
      .filter(Boolean); // Фильтруем пустые строки
    
    console.log('📋 Contract methods found in ABI:', methodNames);
    
    // Check if all required methods exist in ABI
    const missingRequiredMethods = requiredMethods.filter(method => !methodNames.includes(method));
    
    if (missingRequiredMethods.length > 0) {
      console.error('❌ Missing required methods in ABI:', missingRequiredMethods);
      return false;
    }
    
    // Check for optional methods and just log warnings
    const missingOptionalMethods = optionalMethods.filter(method => !methodNames.includes(method));
    
    if (missingOptionalMethods.length > 0) {
      console.warn('⚠️ Some optional methods are missing in ABI:', missingOptionalMethods);
      console.warn('This may limit functionality but is not critical');
    }
    
    console.log('✅ Contract ABI contains all required methods');
    return true;
  } catch (error) {
    console.error('❌ Error validating contract ABI:', error);
    return false;
  }
}

export default function useContractTender() {
  // All state hooks must be called unconditionally at the top level
  const { provider, signer, account } = useWeb3();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContractAvailable, setIsContractAvailable] = useState<boolean>(false);
  const [contractStatus, setContractStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [contractErrorDetails, setContractErrorDetails] = useState<string | null>(null);

  // Use refs to safely track values across renders
  const contractRef = useRef<Contract | null>(null);
  const isContractAvailableRef = useRef(isContractAvailable);
  
  // Track last call time for debouncing
  const lastGetActiveTendersCall = useRef<number>(0);
  const isLoadingTenders = useRef<boolean>(false);
  const initAttempts = useRef<number>(0);
  
  // Улучшенная проверка подключения напрямую через window.ethereum
  const forceContractInitialization = useCallback(async (): Promise<boolean> => {
    try {
      setContractStatus('loading');
      setContractErrorDetails(null);
      console.log('🚀 Initializing contract...');
      
      // Проверяем адрес контракта
      if (!CONTRACT_ADDRESS) {
        console.error('❌ Contract address is not defined');
          setIsContractAvailable(false);
        setError('Smart contract address is not configured. Please check your environment settings.');
        setContractStatus('error');
        setContractErrorDetails('Missing contract address in environment configuration');
        return false;
      }
      console.log(`📋 Using contract address: ${CONTRACT_ADDRESS}`);
      
      // Проверяем наличие window.ethereum
      console.log('🔄 Checking window.ethereum availability');
      if (typeof window === 'undefined' || !window.ethereum) {
        console.error('❌ window.ethereum is not available');
        setError('MetaMask extension is not installed or not accessible');
        setContractStatus('error');
        setContractErrorDetails('MetaMask extension is not installed or not accessible');
        return false;
      }
      console.log('✅ window.ethereum is available');
      
      // Проверяем сеть
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        console.log(`📊 Current chain ID: ${chainId}`);
        
        // Check if we're on Sepolia (0xaa36a7) or local Hardhat network (0x7a69)
        const isValidNetwork = chainId === '0xaa36a7' || chainId === '0x7a69';
        if (!isValidNetwork) {
          console.warn(`⚠️ Connected to unsupported network: ${chainId}, expected either 0xaa36a7 (Sepolia) or 0x7a69 (Hardhat local)`);
        } else {
          console.log(`✅ Connected to supported network: ${chainId}`);
        }
      } catch (error) {
        console.error('❌ Error checking network:', error);
      }
      
      // Запрашиваем подключение к MetaMask
      try {
        console.log('🔄 Requesting MetaMask accounts...');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log(`✅ Connected to accounts: ${accounts.join(', ')}`);
      } catch (error) {
        console.error('❌ User rejected account connection:', error);
        setError('User rejected MetaMask connection');
        setContractStatus('error');
        setContractErrorDetails('User rejected MetaMask connection');
        return false;
      }
      
      // Check current network and switch only if we're not on a supported network
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        // If we're on Hardhat local network, don't try to switch to Sepolia
        if (chainId === '0x7a69') {
          console.log('✅ Already connected to Hardhat local network (0x7a69), not switching');
        }
        // If we're not on a supported network, try to switch to one
        else if (chainId !== '0xaa36a7') {
          console.log('🔄 Not on a supported network, trying Hardhat local first...');
          
          try {
            // Try switching to Hardhat local first (since that's what we're using)
            await window.ethereum.request({ 
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x7a69' }] // Hardhat local chainId
            });
            console.log('✅ Switched to Hardhat local network');
          } catch (hardhatSwitchError: any) {
            // If we can't switch to Hardhat, try Sepolia
            console.log('⚠️ Could not switch to Hardhat local, trying Sepolia...');
            
            try {
              await window.ethereum.request({ 
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xaa36a7' }] // Sepolia chainId
              });
              console.log('✅ Switched to Sepolia network');
            } catch (sepoliaSwitchError: any) {
              // If we can't switch to Sepolia and it's not because it doesn't exist, fail
              if (sepoliaSwitchError.code !== 4902) {
                console.error('❌ Failed to switch to any supported network:', sepoliaSwitchError);
                setError('Failed to switch to a supported network');
                setContractStatus('error');
                setContractErrorDetails('Failed to switch to a supported network');
                return false;
              }
              
              // Try to add Sepolia if it doesn't exist
              console.log('🔄 Sepolia network not found, attempting to add it...');
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0xaa36a7',
                    chainName: 'Sepolia Testnet',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://sepolia.infura.io/v3/'],
                    blockExplorerUrls: ['https://sepolia.etherscan.io/']
                  }]
                });
                console.log('✅ Added Sepolia network');
              } catch (addSepoliaError) {
                console.error('❌ Failed to add Sepolia network:', addSepoliaError);
                setError('Failed to add Sepolia network to MetaMask');
                setContractStatus('error');
                setContractErrorDetails('Failed to add Sepolia network to MetaMask');
                return false;
              }
            }
              }
            } else {
          console.log('✅ Already connected to Sepolia network, not switching');
        }
      } catch (networkError) {
        console.error('❌ Network switching error:', networkError);
        setError('Error switching networks');
        setContractStatus('error');
        setContractErrorDetails('Error switching networks');
        return false;
      }
      
      // Получаем провайдер и подписывающего
      console.log('🔄 Creating provider and signer...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const newSigner = await provider.getSigner();
      const signerAddress = await newSigner.getAddress();
      console.log(`✅ Got signer with address: ${signerAddress}`);
      
      // Проверяем ABI
      if (!ABI || ABI.length === 0) {
        console.error('❌ ABI is empty or undefined');
        setError('Contract ABI is missing or invalid');
        setContractStatus('error');
        setContractErrorDetails('Contract ABI is missing or invalid');
        return false;
      }
      
      // First validate the ABI
      if (!validateContractABI(ABI)) {
                setIsContractAvailable(false);
        setError('Contract ABI is invalid or missing required methods. Check console for details.');
        setContractStatus('error');
        setContractErrorDetails('ABI validation failed: missing required methods or invalid format');
        return false;
      }
      
      // Проверяем наличие метода tenderCount в ABI
      const hasTenderCount = ABI.some((item: any) => 
        typeof item === 'string' 
          ? item.includes('tenderCount')
          : item.name === 'tenderCount'
      );
      
      if (!hasTenderCount) {
        console.warn('⚠️ tenderCount method not found in ABI');
      }
      
      // Создаем новый экземпляр контракта
      console.log(`🔄 Creating contract instance at address: ${CONTRACT_ADDRESS}`);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, newSigner);
      contractRef.current = contract;
      
      // Verify the contract address first
      const isValidContract = await verifyContractAddress(CONTRACT_ADDRESS, provider);
      if (!isValidContract) {
        console.error(`❌ No valid contract found at ${CONTRACT_ADDRESS}`);
              setIsContractAvailable(false);
        setError(`No valid contract found at address ${CONTRACT_ADDRESS}. The contract may not be deployed or the address may be incorrect.`);
        setContractStatus('error');
        setContractErrorDetails(`Invalid contract at ${CONTRACT_ADDRESS}: No bytecode found or invalid address format`);
        return false;
      }
      
      // Проверяем соединение с контрактом вызовом простой функции
      try {
        console.log(`🔄 Testing contract with direct call to tenderCount()`);
        const count = await contract.tenderCount();
        console.log(`✅ Direct contract call succeeded! Tender count: ${count}`);
      } catch (error: any) {
        console.error(`❌ Failed to call tenderCount():`, error);
        
        // Проверяем, является ли ошибка проблемой декодирования данных
        if (error.message.includes('could not decode result data')) {
          console.error('❌ Data decoding error - contract address or ABI mismatch!');
          setIsContractAvailable(false);
          setError(`Contract call failed: The contract at ${CONTRACT_ADDRESS} does not match the expected interface. Please verify the contract address and ABI.`);
          setContractStatus('error');
          setContractErrorDetails(`Contract call failed: The contract at ${CONTRACT_ADDRESS} does not match the expected interface. Please verify the contract address and ABI.`);
          return false;
        }
        
        // Проверяем другие распространенные ошибки
        if (error.message.includes('call revert exception')) {
          console.error('❌ Contract reverted the call - function may not exist or be accessible');
        } else if (error.message.includes('invalid address')) {
          console.error('❌ Invalid contract address format');
        } else if (error.message.includes('contract not deployed')) {
          console.error('❌ No contract deployed at this address');
        }
        
        setIsContractAvailable(false);
        setError(`Failed to verify contract: ${error.message}`);
        setContractStatus('error');
        setContractErrorDetails(`Failed to verify contract: ${error.message}`);
        return false;
      }
      
      // Обновляем состояние
      setIsContractAvailable(true);
      isContractAvailableRef.current = true;
      
      setContract(contract);
      
      console.log(`✅ Contract initialized successfully with direct method`);
      return true;
      } catch (err) {
      console.error(`❌ Failed to initialize contract:`, err);
          setIsContractAvailable(false);
      setError(`Failed to initialize contract: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
  const checkContractAvailability = useCallback((): { available: boolean; error: string } => {
    const available = isContractAvailableRef.current;
    
    if (!available) {
      const errorMsg = 'Contract is not available. Please connect your wallet.';
      // Use type casting to fix the type mismatch
      setError(errorMsg);
      return { available: false, error: errorMsg };
    }
    
    return { available: true, error: '' };
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

  // Получить тендер
  const getTender = useCallback(async (id: string): Promise<ContractResponse<ContractTender | null>> => {
    console.log(`🔍 Attempting to get tender with ID: ${id}`);
    
    // Check contract availability
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      console.error(`❌ Contract not available for getTender: ${availabilityError}`);
      setError(availabilityError || 'Contract not available');
      return { success: false, error: availabilityError || 'Contract not available', data: null };
    }
    
    try {
      console.log(`⏳ Fetching tender ${id} from contract...`);
      const tenderData = await contractRef.current!.getTender(id);
      console.log(`📦 Raw tender data received:`, tenderData);
      
      // Check if tender exists (in the contract, non-existent tenders have ID of 0)
      if (tenderData.id.toString() === '0') {
        console.warn(`⚠️ Tender with ID ${id} does not exist in contract`);
        return { success: false, error: 'Tender does not exist', data: null };
      }
      
      try {
        // Instead of directly calling a function from dependencies, use inline conversion logic
        // This helps avoid the "used before declaration" error
        if (!tenderData) {
          throw new Error('Tender data is undefined');
        }
        
        // Map numeric status to TenderStatus type
        const statusMap: TenderStatus[] = ['OPEN', 'CLOSED', 'AWARDED', 'COMPLETED', 'CANCELLED'];
        const status = statusMap[Number(tenderData.status)] || 'OPEN';
        
        // Convert BigNumber values to regular numbers
        const adaptedTender: ContractTender = {
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
          status: status,
          createdAt: new Date(Number(tenderData.createdAt) * 1000).toISOString(),
          expiresAt: new Date(Number(tenderData.expiresAt) * 1000).toISOString(),
          timeLeft: Math.max(0, Math.floor((Number(tenderData.expiresAt) * 1000 - Date.now()) / 1000))
        };
        
        return { success: true, data: adaptedTender };
    } catch (err: any) {
        console.error('Error parsing tender data:', err);
        return { success: false, error: `Error parsing tender data: ${err.message}`, data: null };
      }
    } catch (err: any) {
      console.error(`❌ Error fetching tender ${id}:`, err);
      
      // Check for specific "Tender does not exist" error
      if (err.message && (
          err.message.includes('Tender does not exist') || 
          (err.reason && err.reason.includes('Tender does not exist'))
      )) {
        console.warn(`⚠️ Contract confirmed tender ${id} does not exist`);
        return { success: false, error: 'Tender does not exist', data: null };
      }
      
      setError(err.message || 'Failed to fetch tender');
      return { success: false, error: `Error fetching tender: ${err.message || 'Unknown error'}`, data: null };
    }
  }, [contractRef, checkContractAvailability, setError]);

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

  // Helper function to check if a tender exists in the blockchain without throwing errors
  const checkTenderExists = useCallback(async (tenderId: string): Promise<boolean> => {
    try {
      console.log(`🔍 Checking if tender ${tenderId} exists in blockchain...`);
      
      // Make a safe call that catches the revert error
      try {
        const tenderResponse = await getTender(tenderId);
        return tenderResponse.success && !!tenderResponse.data; // True if the request was successful and data exists
      } catch (error: any) {
        // If we get here, the contract call itself threw an error
        console.error(`❌ Contract error checking tender existence:`, error);
        
        // Check if the error is specifically about tender not existing
        if (error.message && (
          error.message.includes('Tender does not exist') ||
          (error.reason && error.reason.includes('Tender does not exist'))
        )) {
          console.warn(`⚠️ Caught 'Tender does not exist' error - tender ${tenderId} confirmed not to exist`);
          return false; // Tender definitely doesn't exist
        }
        
        // For other errors, it's safer to fail the check
        return false;
      }
    } catch (error) {
      console.error(`❌ Error in checkTenderExists wrapper:`, error);
      return false;
    }
  }, [getTender]);

  // Submit bid function with retry and better error handling
  const submitBid = useCallback(async (
    tenderId: string,
    amount: number,
    proposal: string
  ): Promise<ContractResponse<{ hash: string }>> => {
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
      console.log(`🔍 Checking if tender ${tenderId} exists before submitting bid...`);
      
      // First check if the tender exists to avoid the "Tender does not exist" error
      const tenderExists = await checkTenderExists(tenderId);
      if (!tenderExists) {
        const errorMsg = `Tender with ID ${tenderId} does not exist in the blockchain. It may have been removed or never existed.`;
        console.error(`❌ ${errorMsg}`);
        return { 
          success: false, 
          error: errorMsg
        };
      }
      
      console.log(`💸 Taking tender ${tenderId}...`);
      
      // Call takeTender instead of submitBid since that's what our contract actually has
      const tx = await contractRef.current!.takeTender(tenderId);
      
      console.log(`📝 Tender taking transaction sent: ${tx.hash}`);
      console.log(`⏱️ Waiting for transaction confirmation...`);
      
      const receipt = await tx.wait();
      console.log(`✅ Tender taken confirmed in block ${receipt.blockNumber}`);

      return {
        success: true,
        data: { hash: receipt.hash },
        hash: receipt.hash
      };
    } catch (err: any) {
      console.error(`❌ Error taking tender:`, err);
      
      // Check for specific error types
      let errorMessage = '';
      
      if (err.code === 'CALL_EXCEPTION' || err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        // Contract execution error
        if (err.reason) {
          errorMessage = `Contract error: ${err.reason}`;
        } else if (err.message && err.message.includes('Tender does not exist')) {
          errorMessage = 'Tender does not exist';
        } else if (err.message && err.message.includes('Cannot take your own tender')) {
          errorMessage = 'You cannot take your own tender';
        } else if (err.message && err.message.includes('Tender is not open')) {
          errorMessage = 'Tender is not open for taking';
        } else if (err.message && err.message.includes('Tender has expired')) {
          errorMessage = 'Tender has expired';
        } else {
          errorMessage = `Contract execution failed: ${err.message}`;
        }
      } else if (err.code === 'ACTION_REJECTED') {
        // User rejected transaction
        errorMessage = 'Transaction rejected by user';
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        // Insufficient funds
        errorMessage = 'Insufficient funds for transaction';
      } else if (err.message) {
        // Generic error with message
        errorMessage = err.message;
      } else {
        // Unknown error
        errorMessage = 'Unknown error taking tender';
      }
      
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [checkContractAvailability, signer, contractRef, checkTenderExists]);

  // Получить все заявки на тендер (адаптировано для контракта без getBidsForTender)
  const getBidsForTender = useCallback(async (id: string): Promise<ContractResponse<{ id: string; bidder: string; amount: number; timestamp: string; status: string }[]>> => {
    console.log(`⚠️ getBidsForTender called for tender ${id}, but this contract doesn't support listing bids`);
    
    // Check if we can at least get the tender to see if there's a bidder assigned
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { 
        success: false, 
        error: `Contract not available: ${availabilityError}. Note: This contract doesn't support listing bids.` 
      };
    }

    setLoading(true);
    setError(null);

    try {
      // Try to get the tender to check if there's a bidder
      const tender = await contractRef.current!.getTender(id);
      
      if (tender && tender.bidder && tender.bidder !== '0x0000000000000000000000000000000000000000') {
        // If there's a bidder, create a single mock bid entry
        const mockBid = {
          id: '1',
          bidder: tender.bidder,
          amount: 0, // We don't store bid amounts in this contract
          timestamp: new Date(Number(tender.createdAt) * 1000).toISOString(),
          status: tender.status === 2 ? 'ACCEPTED' : 'PENDING' // 2 is AWARDED in enum
        };

      return {
        success: true,
          data: [mockBid],
          error: 'Note: This contract only shows the assigned bidder, not all bids'
        };
      }
      
      return {
        success: true,
        data: [], // No bidder assigned
        error: 'Note: This contract doesn\'t support listing all bids'
      };
    } catch (err: any) {
      console.error('Error getting tender for bid info:', err);
      setError(err.message || 'Failed to get bids (not supported by this contract)');
      return { 
        success: false, 
        error: err.message || 'Failed to get bids (not supported by this contract)',
        data: []
      };
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

  // Add a helper function to add Hardhat network to MetaMask
  const addHardhatNetworkToMetaMask = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.ethereum) {
      console.error('❌ window.ethereum is not available');
      return false;
    }
    
    try {
      console.log('🔄 Adding Hardhat local network to MetaMask...');
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x7a69',  // 31337 in hexadecimal
          chainName: 'Hardhat Local',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['http://127.0.0.1:8545/'],
          blockExplorerUrls: null
        }]
      });
      console.log('✅ Added Hardhat local network to MetaMask');
      
      // Try to switch to the Hardhat network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x7a69' }]
      });
      console.log('✅ Switched to Hardhat local network');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to add Hardhat network to MetaMask:', error);
      return false;
    }
  }, []);

  // Получить количество тендеров в контракте
  const getTenderCount = useCallback(async (): Promise<string> => {
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      console.error("Contract not available for getTenderCount:", availabilityError);
      return "0";
    }

    try {
      console.log("Getting tender count from contract");
      const count = await contractRef.current!.tenderCount();
      console.log("Current tender count:", count.toString());
      return count.toString();
    } catch (err: any) {
      console.error('Error getting tender count:', err);
      return "0";
    }
  }, [contractRef, checkContractAvailability]);

  // Migrate a tender from database to blockchain
  const migrateTenderToBlockchain = useCallback(async (
    tenderId: string,
    title: string,
    description: string,
    budget: string,
    deadline: string | number | bigint,
    status: TenderStatus
  ): Promise<ContractResponse<{ id: string }>> => {
    console.log(`🔄 Migrating tender ${tenderId} to blockchain...`);
    
    // Check contract availability
    const { available, error: availabilityError } = checkContractAvailability();
    if (!available) {
      return { success: false, error: availabilityError };
    }

    // Check if wallet is connected
    if (!signer) {
      return { success: false, error: 'Wallet not connected' };
    }

    setLoading(true);
    setError(null);

    try {
      // Convert status string to contract enum value
      const statusMap: Record<TenderStatus, number> = {
        'OPEN': 0,
        'CLOSED': 1,
        'AWARDED': 2,
        'COMPLETED': 3,
        'CANCELLED': 4
      };
      const statusValue = statusMap[status] || 0;

      // Format deadline to UTC timestamp if it's not already a number
      let deadlineTimestamp: number;
      if (typeof deadline === 'string') {
        deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
      } else if (typeof deadline === 'bigint') {
        deadlineTimestamp = Number(deadline);
      } else {
        deadlineTimestamp = Number(deadline);
      }

      // Create the tender in the blockchain
      console.log(`Creating tender in blockchain with: title=${title}, budget=${budget}, deadline=${deadlineTimestamp}`);
      const tx = await contractRef.current!.createTender(
        title,
        description,
        budget,
        deadlineTimestamp,
        0, // Default distance
        0, // Default weight
        'General', // Default cargoType
        7  // Default urgencyDays
      );

      const receipt = await tx.wait();
      console.log('Transaction receipt:', receipt);

      // Get the tender ID from events or last tender count
      const tenderCount = await contractRef.current!.tenderCount();
      const newTenderId = (tenderCount - 1).toString();

      console.log(`✅ Tender migrated to blockchain with ID: ${newTenderId}`);
      return {
        success: true,
        data: { id: newTenderId },
        hash: receipt.transactionHash
      };
    } catch (err: any) {
      console.error('❌ Error migrating tender to blockchain:', err);
      const errorMessage = err.message || 'Failed to migrate tender to blockchain';
      setError(errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    } finally {
      setLoading(false);
    }
  }, [contractRef, signer, checkContractAvailability]);

  return {
    loading,
    error,
    isContractAvailable,
    contractStatus,
    contractErrorDetails,
    createTender,
    getTender,
    getActiveTenders,
    takeTender,
    completeTender,
    cancelTender,
    submitBid,
    getBidsForTender,
    checkContractStatus,
    forceContractInitialization,
    addHardhatNetworkToMetaMask,
    getTenderCount,
    migrateTenderToBlockchain
  };
} 