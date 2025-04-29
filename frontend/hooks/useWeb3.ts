import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useWeb3() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to track the latest values without triggering re-renders
  const accountRef = useRef<string | null>(null);
  const providerRef = useRef<ethers.BrowserProvider | null>(null);
  const signerRef = useRef<ethers.Signer | null>(null);
  
  // Last connection attempt timestamp to prevent rapid reconnection attempts
  const lastConnectionAttemptRef = useRef<number>(0);

  // Initialize web3 connection
  const initWeb3 = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
      console.log("Already connecting to Web3, skipping");
      return { success: false, error: "Connection in progress" };
    }
    
    // Throttle connection attempts
    const now = Date.now();
    if (now - lastConnectionAttemptRef.current < 3000) {
      console.log("Connection attempt too soon, skipping");
      return { success: false, error: "Too many connection attempts" };
    }
    
    lastConnectionAttemptRef.current = now;
    setIsConnecting(true);
    setError(null);
    
    try {
      // Check if ethereum is available
      if (!window.ethereum) {
        throw new Error("MetaMask не установлен. Пожалуйста, установите расширение MetaMask.");
      }
      
      console.log("Initializing Web3 provider");
      
      // Create provider instance using Ethers.js v6 API
      const provider = new ethers.BrowserProvider(window.ethereum);
      providerRef.current = provider;
      setProvider(provider);
      
      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const account = accounts[0];
      accountRef.current = account;
      setAccount(account);
      
      // Get network information
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      
      // Get signer
      const signer = await provider.getSigner();
      signerRef.current = signer;
      setSigner(signer);
      
      console.log("Web3 initialized successfully", { account, chainId: Number(network.chainId) });
      
      return { success: true, data: { provider, signer, account } };
    } catch (error: any) {
      console.error("Failed to initialize Web3:", error);
      
      const errorMessage = error.message || "Unknown error connecting to MetaMask";
      setError(errorMessage);
      
      return { success: false, error: errorMessage };
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  // Connect to wallet
  const connectWallet = useCallback(async () => {
    return initWeb3();
  }, [initWeb3]);

  // Handle account changes
  const handleAccountsChanged = useCallback(async (accounts: string[]) => {
    if (accounts.length === 0) {
      console.log("Disconnected from MetaMask");
      setAccount(null);
      accountRef.current = null;
    } else if (accounts[0] !== accountRef.current) {
      console.log("Account changed:", accounts[0]);
      setAccount(accounts[0]);
      accountRef.current = accounts[0];
      
      // Update signer when account changes
      if (providerRef.current) {
        try {
          const newSigner = await providerRef.current.getSigner();
          setSigner(newSigner);
          signerRef.current = newSigner;
        } catch (error) {
          console.error("Failed to get signer after account change:", error);
        }
      }
    }
  }, []);

  // Handle chain changes
  const handleChainChanged = useCallback(async (chainIdHex: string) => {
    // chainId is in hex format
    const newChainId = parseInt(chainIdHex, 16);
    console.log("Chain changed:", newChainId);
    setChainId(newChainId);
    
    // Reload provider and signer when chain changes
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        providerRef.current = provider;
        setProvider(provider);
        
        const signer = await provider.getSigner();
        signerRef.current = signer;
        setSigner(signer);
      } catch (error) {
        console.error("Failed to update provider after chain change:", error);
      }
    }
  }, []);

  // Handle disconnection
  const handleDisconnect = useCallback((error: { code: number; message: string }) => {
    console.log("MetaMask disconnected:", error);
    setError(`MetaMask disconnected: ${error.message}`);
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (window.ethereum) {
      // Early return if the event listeners are already added
      const getAccounts = async () => {
        try {
          // Passive check for existing connection
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            console.log("Found existing connection", accounts[0]);
            const account = accounts[0];
            accountRef.current = account;
            setAccount(account);
            
            // Initialize provider and signer using Ethers.js v6 API
            const provider = new ethers.BrowserProvider(window.ethereum);
            providerRef.current = provider;
            setProvider(provider);
            
            const network = await provider.getNetwork();
            setChainId(Number(network.chainId));
            
            const signer = await provider.getSigner();
            signerRef.current = signer;
            setSigner(signer);
          }
        } catch (error) {
          console.error("Error checking existing accounts:", error);
        }
      };
      
      getAccounts();
      
      // Set up event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('disconnect', handleDisconnect);
      
      // Clean up listeners
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      };
    }
  }, [handleAccountsChanged, handleChainChanged, handleDisconnect]);

  // Return stable references using useCallback and useMemo
  const memoizedProviderValue = useMemo(() => provider, [provider]);
  const memoizedSignerValue = useMemo(() => signer, [signer]);
  const memoizedAccountValue = useMemo(() => account, [account]);
  const memoizedChainIdValue = useMemo(() => chainId, [chainId]);
  
  return {
    provider: memoizedProviderValue,
    signer: memoizedSignerValue,
    account: memoizedAccountValue,
    chainId: memoizedChainIdValue,
    connectWallet,
    isConnecting,
    isConnected: !!memoizedAccountValue,
    error
  };
}