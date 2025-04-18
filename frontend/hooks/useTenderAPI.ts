import { useState, useCallback, useRef, useMemo } from 'react';

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Forward declare the TenderAPI type for use in the singleton
interface TenderAPIInstance {
  loading: boolean;
  error: string | null;
  useMockData: boolean;
  toggleMockData: () => void;
  getTenders: () => Promise<ApiResponse<Tender[]>>;
  getTenderById: (id: string) => Promise<ApiResponse<Tender>>;
  createTender: (tenderData: CreateTenderData) => Promise<ApiResponse<Tender>>;
  updateTender: (id: string, tenderData: Partial<Tender>) => Promise<ApiResponse<Tender>>;
  deleteTender: (id: string) => Promise<ApiResponse<void>>;
  getBids: (tenderId: string) => Promise<ApiResponse<Bid[]>>;
  getBidsForTender: (tenderId: string) => Promise<ApiResponse<Bid[]>>;
  createBid: (bidData: { tenderId: string; bidder?: string; amount: number; proposal: string; }) => Promise<ApiResponse<Bid>>;
  updateBid: (tenderId: string, bidId: string, bidData: Partial<Bid>) => Promise<ApiResponse<Bid>>;
  deleteBid: (tenderId: string, bidId: string) => Promise<ApiResponse<void>>;
  loginWithWallet: (walletAddress: string) => Promise<ApiResponse<User>>;
  getCurrentUser: () => Promise<ApiResponse<User>>;
}

// The shared singleton instance
let SINGLETON_INSTANCE: TenderAPIInstance | null = null;

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  walletAddress: string;
  createdAt: string;
}

export interface Tender {
  id: string;
  title: string;
  description: string;
  budget: number;
  deadline: string;
  status: 'OPEN' | 'CLOSED' | 'AWARDED' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  creator?: User;
  categories?: Category[];
  bids?: Bid[];
  documents?: Document[];
  _count?: {
    bids: number;
  };
}

export interface Bid {
  id: string;
  amount: number;
  proposal: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: string;
  updatedAt: string;
  tenderId: string;
  bidderId: string;
  tender?: Tender;
  bidder?: User;
  documents?: Document[];
  transactionHash?: string;
}

export interface Document {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
  tenderId?: string;
  bidId?: string;
  tender?: Tender;
  bid?: Bid;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  tenders?: Tender[];
}

interface CreateTenderData {
  title: string;
  description: string;
  budget: number;
  deadline: string;
  walletAddress: string;
  categories?: string[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Custom error class for request timeouts
class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

// Constants for API requests
const API_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;

// Кеширование результатов запросов
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 1000 * 60; // 1 минута

// Мок-данные для случаев, когда API недоступен
const MOCK_DATA = {
  tenders: [
    {
      id: 'mock-1',
      title: 'Демо тендер #1 - API недоступен',
      description: 'Расстояние: 1000 км, Вес: 500 кг, Тип груза: perishable, Срок доставки: 3 дня',
      budget: 1500,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'OPEN' as const,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      creatorId: '1',
      creator: {
        id: '1',
        name: 'Демо пользователь',
        email: 'demo@example.com',
        walletAddress: '0x123456789abcdef',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      categories: [{ id: '1', name: 'perishable', createdAt: new Date().toISOString() }],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'mock-2',
      title: 'Демо тендер #2 - API недоступен',
      description: 'Расстояние: 500 км, Вес: 1000 кг, Тип груза: general, Срок доставки: 5 дней',
      budget: 2000,
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'OPEN' as const,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      creatorId: '2',
      creator: {
        id: '2',
        name: 'Демо пользователь 2',
        email: 'demo2@example.com',
        walletAddress: '0x987654321fedcba',
        createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
      },
      categories: [{ id: '2', name: 'general', createdAt: new Date().toISOString() }],
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    }
  ],
  bids: [
    {
      id: 'mock-bid-1',
      amount: 1400,
      proposal: 'Демо заявка на тендер #1',
      status: 'PENDING' as const,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      tenderId: 'mock-1',
      bidderId: '3',
      bidder: {
        id: '3',
        name: 'Демо участник',
        email: 'bidder@example.com',
        walletAddress: '0xabcdef123456789',
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
      }
    }
  ]
};

// Использовать ли мок-данные при ошибках API
const USE_MOCK_DATA_ON_ERROR = true;

// Helper function to create a fetch request with timeout
const fetchWithTimeout = async (url: string, fetchOptions: RequestInit, timeoutMs: number = 30000): Promise<Response> => {
  const controller = new AbortController();
  const signal = controller.signal;
  
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    // Create a promise that rejects on timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort('Request timeout');
        reject(new RequestTimeoutError(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    // Wrapping the fetch in a try/catch to handle network errors
    const fetchPromise = fetch(url, {
      ...fetchOptions,
      signal
    });
    
    // Race the fetch against the timeout
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    // Always clean up the timeout to prevent memory leaks
    if (timeoutId) clearTimeout(timeoutId);
  }
};

// Helper function to get mock tenders for development and testing
const getMockTenders = (): Tender[] => {
  return [
    {
      id: 'mock-tender-1',
      title: 'Transport Refrigerated Goods',
      description: 'Need temperature-controlled transportation for perishable items from warehouse to distribution centers.',
      budget: 3000,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'OPEN',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: 'mock-user-1',
      creator: {
        id: 'mock-user-1',
        name: 'Supply Chain Corp',
        email: 'supply@example.com',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      categories: [
        { id: 'cat-1', name: 'Transportation', createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'cat-2', name: 'Cold Chain', createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() }
      ],
      bids: []
    },
    {
      id: 'mock-tender-2',
      title: 'Last Mile Delivery Partners',
      description: 'Seeking local delivery partners for last-mile delivery in urban areas.',
      budget: 5000,
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'OPEN',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: 'mock-user-2',
      creator: {
        id: 'mock-user-2',
        name: 'E-Commerce Solutions',
        email: 'ecommerce@example.com',
        walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      },
      categories: [
        { id: 'cat-1', name: 'Transportation', createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'cat-3', name: 'Urban Delivery', createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() }
      ],
      bids: []
    }
  ];
};

// Helper function to get mock bids for development and testing
const getMockBids = (tenderId: string): Bid[] => {
  return [
    {
      id: `mock-bid-1-${tenderId}`,
      amount: 2800,
      proposal: "We offer same-day temperature-controlled delivery with real-time tracking.",
      status: 'PENDING',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      tenderId: tenderId,
      bidderId: 'mock-bidder-1',
      bidder: {
        id: 'mock-bidder-1',
        name: 'Cold Transport Inc',
        email: 'transport@example.com',
        walletAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
      }
    },
    {
      id: `mock-bid-2-${tenderId}`,
      amount: 3100,
      proposal: "Our fleet of refrigerated trucks ensures your goods arrive in perfect condition.",
      status: 'PENDING',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      tenderId: tenderId,
      bidderId: 'mock-bidder-2',
      bidder: {
        id: 'mock-bidder-2',
        name: 'Premium Logistics',
        email: 'logistics@example.com',
        walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
      }
    }
  ];
};

// Main API implementation as a factory function
const createTenderAPI = (): TenderAPIInstance => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useMockDataFromEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  const [useMockData, setUseMockData] = useState<boolean>(useMockDataFromEnv);
  
  // Log initial state
  console.log(`TenderAPI instance created with mock data ${useMockData ? 'enabled' : 'disabled'} (env: ${useMockDataFromEnv})`);

  const handleRequest = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {},
    retry: number = 0
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);
    
    // Early return for mock data if enabled
    if (useMockData) {
      console.log(`Using mock data for ${endpoint} (mock mode enabled)`);
      
      if (endpoint === '/tenders') {
        setLoading(false);
        return { data: getMockTenders() as unknown as T, error: null, loading: false };
      } 
      
      if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
        const tenderId = endpoint.split('/')[2];
        console.log(`Getting mock bids for tender: ${tenderId}`);
        setLoading(false);
        return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
      }
      
      // For specific tender details
      if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
        const tenderId = endpoint.split('/')[2];
        const allTenders = getMockTenders();
        const tender = allTenders.find(t => t.id === tenderId);
        
        if (tender) {
          setLoading(false);
          return { data: tender as unknown as T, error: null, loading: false };
        }
      }
    }

    try {
      console.log(`Making API request to ${endpoint}:`, options);

      // Add default headers for JSON requests
      const fetchOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          'Content-Type': 'application/json',
        },
      };

      // Fetch with timeout
      const response = await fetchWithTimeout(
        `${API_BASE_URL}${endpoint}`,
        fetchOptions,
        API_TIMEOUT
      );

      // Check if response is OK
      if (!response.ok) {
        // Handle 404 errors differently - they're expected sometimes
        if (response.status === 404) {
          console.log(`Resource not found at ${endpoint}. This might be expected.`);
          // Return empty data rather than treating as error for 404
          return { data: null, error: null, loading: false };
        }
        
        // Handle 500 errors by using mock data
        if (response.status === 500) {
          console.log(`Server error (500) for ${endpoint}. Falling back to mock data.`);
          
          // Switch to mock data mode if not already enabled
          if (!useMockData) {
            setUseMockData(true);
          }
          
          // Return appropriate mock data based on the endpoint
          if (endpoint === '/tenders') {
            setLoading(false);
            return { data: getMockTenders() as unknown as T, error: null, loading: false };
          } 
          
          if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            console.log(`Getting mock bids for tender (500 error): ${tenderId}`);
            setLoading(false);
            return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
          }
          
          // For specific tender details
          if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            const allTenders = getMockTenders();
            const tender = allTenders.find(t => t.id === tenderId);
            
            if (tender) {
              setLoading(false);
              return { data: tender as unknown as T, error: null, loading: false };
            }
          }
        }
        
        // General error fallback - use mock data in development or if mock mode is enabled
        if (process.env.NODE_ENV === 'development' || useMockData) {
          console.log(`HTTP Error (${response.status}) for ${endpoint}. Using mock data as fallback.`);
          
          // Switch to mock data mode if not already enabled
          if (!useMockData) {
            setUseMockData(true);
          }
          
          // Return appropriate mock data based on the endpoint
          if (endpoint === '/tenders') {
            setLoading(false);
            return { data: getMockTenders() as unknown as T, error: null, loading: false };
          } 
          
          if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            console.log(`Getting mock bids for tender (HTTP error): ${tenderId}`);
            setLoading(false);
            return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
          }
          
          // For specific tender details
          if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            const allTenders = getMockTenders();
            const tender = allTenders.find(t => t.id === tenderId);
            
            if (tender) {
              setLoading(false);
              return { data: tender as unknown as T, error: null, loading: false };
            }
          }
        }
        
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // Check content type to ensure we're getting JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('API returned non-JSON content type:', contentType);
        
        try {
          // Try to see what was returned
          const text = await response.text();
          console.log('API response text:', text.substring(0, 200) + '...');
          
          // Show more detailed error in development
          if (process.env.NODE_ENV === 'development') {
            console.log('Development environment detected, showing detailed error');
            
            // Check if it's an HTML response (typically 404/500 error pages)
            if (text.includes('<!DOCTYPE html>')) {
              console.error('API returned an HTML page instead of JSON data');
              
              // In development, we'll use mock data instead
              console.log('Switching to mock data due to HTML response');
              if (!useMockData) {
                setUseMockData(true);
              }
              
              // Return mock data
              if (endpoint.includes('/tenders') && !endpoint.includes('/bids')) {
                // For tender endpoints, return mock tenders
                return { data: getMockTenders() as unknown as T, error: null, loading: false };
              } else if (endpoint.includes('/bids')) {
                // For bid endpoints, return mock bids
                return { data: getMockBids(endpoint.split('/')[2]) as unknown as T, error: null, loading: false };
              }
            }
          }
          
          throw new Error('Response is not JSON. API returned: ' + contentType);
        } catch (textError) {
          throw new Error(`Failed to parse response: ${textError}`);
        }
      }

      // Parse JSON response
      const data = await response.json();
      
      // API response with proper structure
      console.log(`API response from ${endpoint}:`, { status: response.status, ok: response.ok, data: data });
      
      return { data, error: null, loading: false };
    } catch (error: any) {
      let errorMessage = error.message || 'Unknown error';
      
      // Network errors (like CORS, connection refused, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = `Network error: ${error.message}`;
        console.error(`Network error for ${endpoint}:`, error);
      } 
      // Timeout errors
      else if (error instanceof RequestTimeoutError) {
        errorMessage = `Request timed out after ${API_TIMEOUT}ms`;
        console.error(`Timeout for ${endpoint}:`, error);
      }
      // Other errors
      else {
        console.error(`API error for ${endpoint}:`, error);
      }
      
      // Retry logic for certain errors (not 4xx client errors)
      if (retry < MAX_RETRIES && !errorMessage.includes('API error: 4')) {
        console.log(`Retrying request to ${endpoint} (attempt ${retry + 1}/${MAX_RETRIES})`);
        return handleRequest<T>(endpoint, options, retry + 1);
      }
      
      // Return mock data in development mode if API fails
      if (process.env.NODE_ENV === 'development' || useMockData) {
        console.log(`Using mock data for ${endpoint} due to API error`);
        
        // Toggle mock data mode if not already on
        if (!useMockData) {
          setUseMockData(true);
        }
        
        // Return appropriate mock data based on the endpoint
        if (endpoint === '/tenders') {
          setLoading(false);
          return { data: getMockTenders() as unknown as T, error: null, loading: false };
        }
        
        if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
          const tenderId = endpoint.split('/')[2];
          console.log(`Getting mock bids for tender (error case): ${tenderId}`);
          setLoading(false);
          return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
        }
        
        // For specific tender details
        if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
          const tenderId = endpoint.split('/')[2];
          const allTenders = getMockTenders();
          const tender = allTenders.find(t => t.id === tenderId);
          
          if (tender) {
            setLoading(false);
            return { data: tender as unknown as T, error: null, loading: false };
          }
        }
      }
      
      setError(errorMessage);
      return { data: null, error: errorMessage, loading: false };
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, useMockData]);

  const getTenders = useCallback(async (): Promise<ApiResponse<Tender[]>> => {
    return handleRequest<Tender[]>('/tenders');
  }, [handleRequest]);

  const getTenderById = useCallback(async (id: string): Promise<ApiResponse<Tender>> => {
    // Check cache
    const now = Date.now();
    const cacheKey = `/tenders/${id}`;
    const cachedData = cache.get(cacheKey);
    
    // If data exists in cache and isn't stale, return it
    if (cachedData && now - cachedData.timestamp < CACHE_TTL) {
      console.log('Using cached data for tender:', id);
      return { data: cachedData.data, error: null, loading: false };
    }
    
    const result = await handleRequest<Tender>(`/tenders/${id}`);
    
    // Save successful result to cache
    if (result.data) {
      cache.set(cacheKey, { data: result.data, timestamp: now });
    }
    
    return result;
  }, [handleRequest]);

  const createTender = useCallback(async (tenderData: CreateTenderData): Promise<ApiResponse<Tender>> => {
    return handleRequest<Tender>('/tenders', {
      method: 'POST',
      body: JSON.stringify(tenderData),
    });
  }, [handleRequest]);

  const updateTender = useCallback(async (id: string, tenderData: Partial<Tender>): Promise<ApiResponse<Tender>> => {
    return handleRequest<Tender>(`/tenders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tenderData),
    });
  }, [handleRequest]);

  const deleteTender = useCallback(async (id: string): Promise<ApiResponse<void>> => {
    return handleRequest<void>(`/tenders/${id}`, {
      method: 'DELETE',
    });
  }, [handleRequest]);

  const getBids = useCallback(async (tenderId: string): Promise<ApiResponse<Bid[]>> => {
    console.log(`Getting bids for tender: ${tenderId}, mock mode: ${useMockData}`);
    return handleRequest<Bid[]>(`/tenders/${tenderId}/bids`);
  }, [handleRequest, useMockData]);

  const createBid = useCallback(async (bidData: {
    tenderId: string;
    bidder?: string;
    amount: number;
    proposal: string;
  }): Promise<ApiResponse<Bid>> => {
    const { tenderId, ...restData } = bidData;
    
    console.log(`Creating bid for tender ${tenderId}:`, restData);
    
    return handleRequest<Bid>(`/tenders/${tenderId}/bids`, {
      method: 'POST',
      body: JSON.stringify(restData),
    });
  }, [handleRequest]);

  const updateBid = useCallback(async (tenderId: string, bidId: string, bidData: Partial<Bid>): Promise<ApiResponse<Bid>> => {
    return handleRequest<Bid>(`/tenders/${tenderId}/bids/${bidId}`, {
      method: 'PUT',
      body: JSON.stringify(bidData),
    });
  }, [handleRequest]);

  const deleteBid = useCallback(async (tenderId: string, bidId: string): Promise<ApiResponse<void>> => {
    return handleRequest<void>(`/tenders/${tenderId}/bids/${bidId}`, {
      method: 'DELETE',
    });
  }, [handleRequest]);

  const loginWithWallet = useCallback(async (walletAddress: string): Promise<ApiResponse<User>> => {
    return handleRequest<User>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    });
  }, [handleRequest]);

  const getCurrentUser = useCallback(async (): Promise<ApiResponse<User>> => {
    return handleRequest<User>('/users/me');
  }, [handleRequest]);

  // Для тестирования и отладки
  const toggleMockData = useCallback(() => {
    setUseMockData(prev => {
      console.log(`Toggling mock data mode from ${prev} to ${!prev}`);
      // Reset error state when switching modes
      setError(null);
      return !prev;
    });
  }, []);

  // Add getBidsForTender function which is an alias for getBids
  const getBidsForTender = useCallback(async (tenderId: string): Promise<ApiResponse<Bid[]>> => {
    console.log(`getBidsForTender called for tender: ${tenderId}, mock mode: ${useMockData}`);
    return getBids(tenderId);
  }, [getBids, useMockData]);

  return {
    loading,
    error,
    useMockData,
    toggleMockData,
    getTenders,
    getTenderById,
    createTender,
    updateTender,
    deleteTender,
    getBids,
    getBidsForTender,
    createBid,
    updateBid,
    deleteBid,
    loginWithWallet,
    getCurrentUser,
  };
};

// The hook now returns a singleton instance
const useTenderAPI = () => {
  // Always call all hooks unconditionally at the top level
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useMockDataFromEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  const [useMockData, setUseMockData] = useState<boolean>(useMockDataFromEnv);
  
  // Initialize refs
  const instanceRef = useRef<TenderAPIInstance | null>(null);
  const isInitializedRef = useRef<boolean>(false);
  
  // Log initial state only once
  const logInitialState = useCallback(() => {
    if (!isInitializedRef.current) {
      console.log(`TenderAPI hook initialized with mock data ${useMockData ? 'enabled' : 'disabled'} (env: ${useMockDataFromEnv})`);
      isInitializedRef.current = true;
    }
  }, [useMockData, useMockDataFromEnv]);
  
  // Call this immediately
  logInitialState();

  // Define the handleRequest function
  const handleRequest = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {},
    retry: number = 0
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);
    
    // Early return for mock data if enabled
    if (useMockData) {
      console.log(`Using mock data for ${endpoint} (mock mode enabled)`);
      
      if (endpoint === '/tenders') {
        setLoading(false);
        return { data: getMockTenders() as unknown as T, error: null, loading: false };
      } 
      
      if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
        const tenderId = endpoint.split('/')[2];
        console.log(`Getting mock bids for tender: ${tenderId}`);
        setLoading(false);
        return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
      }
      
      // For specific tender details
      if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
        const tenderId = endpoint.split('/')[2];
        const allTenders = getMockTenders();
        const tender = allTenders.find(t => t.id === tenderId);
        
        if (tender) {
          setLoading(false);
          return { data: tender as unknown as T, error: null, loading: false };
        }
      }
    }

    try {
      console.log(`Making API request to ${endpoint}:`, options);

      // Add default headers for JSON requests
      const fetchOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          'Content-Type': 'application/json',
        },
      };

      // Fetch with timeout
      const response = await fetchWithTimeout(
        `${API_BASE_URL}${endpoint}`,
        fetchOptions,
        API_TIMEOUT
      );

      // Check if response is OK
      if (!response.ok) {
        // Handle 404 errors differently - they're expected sometimes
        if (response.status === 404) {
          console.log(`Resource not found at ${endpoint}. This might be expected.`);
          // Return empty data rather than treating as error for 404
          return { data: null, error: null, loading: false };
        }
        
        // Handle 500 errors by using mock data
        if (response.status === 500) {
          console.log(`Server error (500) for ${endpoint}. Falling back to mock data.`);
          
          // Switch to mock data mode if not already enabled
          if (!useMockData) {
            setUseMockData(true);
          }
          
          // Return appropriate mock data based on the endpoint
          if (endpoint === '/tenders') {
            setLoading(false);
            return { data: getMockTenders() as unknown as T, error: null, loading: false };
          } 
          
          if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            console.log(`Getting mock bids for tender (500 error): ${tenderId}`);
            setLoading(false);
            return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
          }
          
          // For specific tender details
          if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            const allTenders = getMockTenders();
            const tender = allTenders.find(t => t.id === tenderId);
            
            if (tender) {
              setLoading(false);
              return { data: tender as unknown as T, error: null, loading: false };
            }
          }
        }
        
        // General error fallback - use mock data in development or if mock mode is enabled
        if (process.env.NODE_ENV === 'development' || useMockData) {
          console.log(`HTTP Error (${response.status}) for ${endpoint}. Using mock data as fallback.`);
          
          // Switch to mock data mode if not already enabled
          if (!useMockData) {
            setUseMockData(true);
          }
          
          // Return appropriate mock data based on the endpoint
          if (endpoint === '/tenders') {
            setLoading(false);
            return { data: getMockTenders() as unknown as T, error: null, loading: false };
          } 
          
          if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            console.log(`Getting mock bids for tender (HTTP error): ${tenderId}`);
            setLoading(false);
            return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
          }
          
          // For specific tender details
          if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
            const tenderId = endpoint.split('/')[2];
            const allTenders = getMockTenders();
            const tender = allTenders.find(t => t.id === tenderId);
            
            if (tender) {
              setLoading(false);
              return { data: tender as unknown as T, error: null, loading: false };
            }
          }
        }
        
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // Check content type to ensure we're getting JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('API returned non-JSON content type:', contentType);
        
        try {
          // Try to see what was returned
          const text = await response.text();
          console.log('API response text:', text.substring(0, 200) + '...');
          
          // Show more detailed error in development
          if (process.env.NODE_ENV === 'development') {
            console.log('Development environment detected, showing detailed error');
            
            // Check if it's an HTML response (typically 404/500 error pages)
            if (text.includes('<!DOCTYPE html>')) {
              console.error('API returned an HTML page instead of JSON data');
              
              // In development, we'll use mock data instead
              console.log('Switching to mock data due to HTML response');
              if (!useMockData) {
                setUseMockData(true);
              }
              
              // Return mock data
              if (endpoint.includes('/tenders') && !endpoint.includes('/bids')) {
                // For tender endpoints, return mock tenders
                return { data: getMockTenders() as unknown as T, error: null, loading: false };
              } else if (endpoint.includes('/bids')) {
                // For bid endpoints, return mock bids
                return { data: getMockBids(endpoint.split('/')[2]) as unknown as T, error: null, loading: false };
              }
            }
          }
          
          throw new Error('Response is not JSON. API returned: ' + contentType);
        } catch (textError) {
          throw new Error(`Failed to parse response: ${textError}`);
        }
      }

      // Parse JSON response
      const data = await response.json();
      
      // API response with proper structure
      console.log(`API response from ${endpoint}:`, { status: response.status, ok: response.ok, data: data });
      
      return { data, error: null, loading: false };
    } catch (error: any) {
      let errorMessage = error.message || 'Unknown error';
      
      // Network errors (like CORS, connection refused, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = `Network error: ${error.message}`;
        console.error(`Network error for ${endpoint}:`, error);
      } 
      // Timeout errors
      else if (error instanceof RequestTimeoutError) {
        errorMessage = `Request timed out after ${API_TIMEOUT}ms`;
        console.error(`Timeout for ${endpoint}:`, error);
      }
      // Other errors
      else {
        console.error(`API error for ${endpoint}:`, error);
      }
      
      // Retry logic for certain errors (not 4xx client errors)
      if (retry < MAX_RETRIES && !errorMessage.includes('API error: 4')) {
        console.log(`Retrying request to ${endpoint} (attempt ${retry + 1}/${MAX_RETRIES})`);
        return handleRequest<T>(endpoint, options, retry + 1);
      }
      
      // Return mock data in development mode if API fails
      if (process.env.NODE_ENV === 'development' || useMockData) {
        console.log(`Using mock data for ${endpoint} due to API error`);
        
        // Toggle mock data mode if not already on
        if (!useMockData) {
          setUseMockData(true);
        }
        
        // Return appropriate mock data based on the endpoint
        if (endpoint === '/tenders') {
          setLoading(false);
          return { data: getMockTenders() as unknown as T, error: null, loading: false };
        }
        
        if (endpoint.includes('/tenders/') && endpoint.includes('/bids')) {
          const tenderId = endpoint.split('/')[2];
          console.log(`Getting mock bids for tender (error case): ${tenderId}`);
          setLoading(false);
          return { data: getMockBids(tenderId) as unknown as T, error: null, loading: false };
        }
        
        // For specific tender details
        if (endpoint.startsWith('/tenders/') && !endpoint.includes('/bids')) {
          const tenderId = endpoint.split('/')[2];
          const allTenders = getMockTenders();
          const tender = allTenders.find(t => t.id === tenderId);
          
          if (tender) {
            setLoading(false);
            return { data: tender as unknown as T, error: null, loading: false };
          }
        }
      }
      
      setError(errorMessage);
      return { data: null, error: errorMessage, loading: false };
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, useMockData]);

  // Define other API methods with useCallback
  const getTenders = useCallback(async (): Promise<ApiResponse<Tender[]>> => {
    return handleRequest<Tender[]>('/tenders');
  }, [handleRequest]);
  
  const getTenderById = useCallback(async (id: string): Promise<ApiResponse<Tender>> => {
    // Check cache
    const now = Date.now();
    const cacheKey = `/tenders/${id}`;
    const cachedData = cache.get(cacheKey);
    
    // If data exists in cache and isn't stale, return it
    if (cachedData && now - cachedData.timestamp < CACHE_TTL) {
      console.log('Using cached data for tender:', id);
      return { data: cachedData.data, error: null, loading: false };
    }
    
    const result = await handleRequest<Tender>(`/tenders/${id}`);
    
    // Save successful result to cache
    if (result.data) {
      cache.set(cacheKey, { data: result.data, timestamp: now });
    }
    
    return result;
  }, [handleRequest]);

  const createTender = useCallback(async (tenderData: CreateTenderData): Promise<ApiResponse<Tender>> => {
    return handleRequest<Tender>('/tenders', {
      method: 'POST',
      body: JSON.stringify(tenderData),
    });
  }, [handleRequest]);

  const updateTender = useCallback(async (id: string, tenderData: Partial<Tender>): Promise<ApiResponse<Tender>> => {
    return handleRequest<Tender>(`/tenders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tenderData),
    });
  }, [handleRequest]);

  const deleteTender = useCallback(async (id: string): Promise<ApiResponse<void>> => {
    return handleRequest<void>(`/tenders/${id}`, {
      method: 'DELETE',
    });
  }, [handleRequest]);

  const getBids = useCallback(async (tenderId: string): Promise<ApiResponse<Bid[]>> => {
    console.log(`Getting bids for tender: ${tenderId}, mock mode: ${useMockData}`);
    return handleRequest<Bid[]>(`/tenders/${tenderId}/bids`);
  }, [handleRequest, useMockData]);

  const createBid = useCallback(async (bidData: {
    tenderId: string;
    bidder?: string;
    amount: number;
    proposal: string;
  }): Promise<ApiResponse<Bid>> => {
    const { tenderId, ...restData } = bidData;
    
    console.log(`Creating bid for tender ${tenderId}:`, restData);
    
    return handleRequest<Bid>(`/tenders/${tenderId}/bids`, {
      method: 'POST',
      body: JSON.stringify(restData),
    });
  }, [handleRequest]);

  const updateBid = useCallback(async (tenderId: string, bidId: string, bidData: Partial<Bid>): Promise<ApiResponse<Bid>> => {
    return handleRequest<Bid>(`/tenders/${tenderId}/bids/${bidId}`, {
      method: 'PUT',
      body: JSON.stringify(bidData),
    });
  }, [handleRequest]);

  const deleteBid = useCallback(async (tenderId: string, bidId: string): Promise<ApiResponse<void>> => {
    return handleRequest<void>(`/tenders/${tenderId}/bids/${bidId}`, {
      method: 'DELETE',
    });
  }, [handleRequest]);

  const loginWithWallet = useCallback(async (walletAddress: string): Promise<ApiResponse<User>> => {
    return handleRequest<User>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    });
  }, [handleRequest]);

  const getCurrentUser = useCallback(async (): Promise<ApiResponse<User>> => {
    return handleRequest<User>('/users/me');
  }, [handleRequest]);
  
  // Add getBidsForTender function which is an alias for getBids
  const getBidsForTender = useCallback(async (tenderId: string): Promise<ApiResponse<Bid[]>> => {
    console.log(`getBidsForTender called for tender: ${tenderId}, mock mode: ${useMockData}`);
    return getBids(tenderId);
  }, [getBids, useMockData]);

  // For testing and debugging
  const toggleMockData = useCallback(() => {
    setUseMockData(prev => {
      console.log(`Toggling mock data mode from ${prev} to ${!prev}`);
      // Reset error state when switching modes
      setError(null);
      return !prev;
    });
  }, []);

  // Create the API instance if it doesn't already exist
  useMemo(() => {
    // If we already have an instance in this component, use it
    if (instanceRef.current) {
      return;
    }
    
    // If we have a global singleton, use that
    if (SINGLETON_INSTANCE) {
      instanceRef.current = SINGLETON_INSTANCE;
      console.log('Using existing TenderAPI singleton instance');
      return;
    }
    
    // Create a new instance with all the methods and state
    const instance: TenderAPIInstance = {
      loading,
      error,
      useMockData,
      toggleMockData,
      getTenders,
      getTenderById,
      createTender,
      updateTender,
      deleteTender,
      getBids,
      getBidsForTender,
      createBid,
      updateBid,
      deleteBid,
      loginWithWallet,
      getCurrentUser,
    };
    
    // Store it locally and globally
    instanceRef.current = instance;
    SINGLETON_INSTANCE = instance;
    console.log('Created new TenderAPI singleton instance');
  }, [
    loading, error, useMockData, toggleMockData,
    getTenders, getTenderById, createTender, updateTender, deleteTender,
    getBids, getBidsForTender, createBid, updateBid, deleteBid,
    loginWithWallet, getCurrentUser
  ]);
  
  // Always return the same instance once created
  return instanceRef.current as TenderAPIInstance;
};

export default useTenderAPI; 