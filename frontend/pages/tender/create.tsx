import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useWeb3 } from '../../hooks/useWeb3';
import PricePredictor from '../../components/PricePredictor';
import useTenderAPI from '../../hooks/useTenderAPI';
import useContractTender from '../../hooks/useContractTender';
import Navbar from '../../components/Navbar';

export default function CreateTender() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    budget: '',
    distance: '',
    weight: '',
    cargoType: 'general',
    urgencyDays: '15',
    expirationMinutes: '10', // время жизни тендера в минутах
    deadline: ''
  });
  const [loading, setLoading] = useState(false);
  const { account, connectWallet, isConnecting, error: walletError } = useWeb3();
  const router = useRouter();
  const tenderAPI = useTenderAPI();
  const contractTender = useContractTender();
  const [contractWarning, setContractWarning] = useState<string | null>(null);

  // Check if contract is available
  useEffect(() => {
    console.log("Contract status:", {
      isAvailable: contractTender.isContractAvailable,
      loading: contractTender.loading,
      error: contractTender.error
    });
    
    if (!contractTender.isContractAvailable) {
      setContractWarning('Смарт-контракт недоступен или не развернут. Тендер будет сохранен только в базе данных.');
    } else {
      setContractWarning(null);
    }
  }, [contractTender.isContractAvailable, contractTender.loading, contractTender.error]);

  const calculateDeadline = () => {
    const now = new Date();
    now.setDate(now.getDate() + parseInt(form.urgencyDays || '15'));
    return now.toISOString();
  };

  const handleCreate = async () => {
    // 1. Check wallet connection
    if (!account) {
      const connected = await connectWallet();
      if (!connected.success) {
        alert("Пожалуйста, подключите кошелек MetaMask");
        return;
      }
    }
    
    // 2. Validate form data
    if (!form.distance || !form.weight) {
      alert("Пожалуйста, заполните поля расстояния и веса");
      return;
    }
    
    setLoading(true);
    let blockchainSuccess = false;
    let blockchainError: Error | null = null;
    let tenderId: string | null = null;
    
    try {
      // Force contract reinitialization before proceeding
      console.log("Forcing contract reinitialization before creating tender");
      const initResult = await contractTender.forceContractInitialization();
      
      if (!initResult) {
        throw new Error("Не удалось инициализировать смарт-контракт. Пожалуйста, убедитесь, что ваш кошелек подключен и вы находитесь в сети Sepolia.");
      }
      
      if (!contractTender.isContractAvailable) {
        throw new Error("Смарт-контракт недоступен. Пожалуйста, переподключите кошелек и попробуйте снова.");
      }
      
      // 3. Save to blockchain
      console.log("Saving tender to blockchain...");
      const title = form.title || `Перевозка груза (${form.weight} кг) на ${form.distance} км`;
      const description = `Расстояние: ${form.distance} км, Вес: ${form.weight} кг, Тип груза: ${form.cargoType}, Срок доставки: ${form.urgencyDays} дней`;
      
      // Create a Date object for the deadline
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + parseInt(form.urgencyDays || '15'));
      
      // Convert deadline to Unix timestamp (seconds since epoch) for blockchain
      const deadlineTimestamp = Math.floor(deadline.getTime() / 1000);
      
      const budget = form.budget ? parseFloat(form.budget) : 2000; // Значение по умолчанию
      const expirationMinutes = parseInt(form.expirationMinutes || '10');
      
      // Улучшенное логирование для отладки
      console.log("Form data:", {
        title,
        description,
        budget,
        deadlineTimestamp,
        distance: form.distance,
        weight: form.weight,
        cargoType: form.cargoType,
        urgencyDays: form.urgencyDays,
        expirationMinutes
      });
      
      console.log("Sending to blockchain with deadline timestamp:", deadlineTimestamp);
      
      try {
        const contractResponse = await contractTender.createTender(
          title,
          description,
          budget,
          deadlineTimestamp, // Pass the Unix timestamp instead of Date object
          parseInt(form.distance),
          parseInt(form.weight),
          form.cargoType,
          parseInt(form.urgencyDays),
          expirationMinutes
        );
        
        console.log("Contract response:", contractResponse);
        
        if (contractResponse.success) {
          blockchainSuccess = true;
          tenderId = contractResponse.data?.id || null;
          
          if (tenderId && !tenderId.startsWith('fallback-id-')) {
            console.log("Tender created in blockchain with ID:", tenderId);
          } else {
            console.warn("Tender was created but couldn't get proper ID from blockchain. Using fallback:", tenderId);
            // Если ID не получен должным образом, запрашиваем текущее количество тендеров
            try {
              console.log("Attempting to get current tender count from contract");
              // Здесь мы хотим получить актуальный ID созданного тендера
              const tenderCount = await contractTender.getTenderCount();
              console.log("Current tender count:", tenderCount);
              if (tenderCount && parseInt(tenderCount) > 0) {
                // Скорее всего, последний ID будет tenderCount - 1
                const probableId = (parseInt(tenderCount) - 1).toString();
                console.log("Probable tender ID based on count:", probableId);
                tenderId = probableId;
                blockchainSuccess = true;
              } else {
                blockchainSuccess = false;
                blockchainError = new Error("Не удалось получить ID тендера из блокчейна");
              }
            } catch (countError) {
              console.error("Error getting tender count:", countError);
              blockchainSuccess = false;
              blockchainError = new Error("Не удалось получить ID тендера из блокчейна");
            }
          }
        } else {
          blockchainError = new Error(contractResponse.error || "Unknown blockchain error");
          console.error("Blockchain error:", contractResponse.error);
          throw blockchainError;
        }
      } catch (txError: unknown) {
        console.error("Transaction error:", txError);
        blockchainError = new Error(`Transaction error: ${txError instanceof Error ? txError.message : "Unknown error"}`);
        throw blockchainError;
      }

      // 4. Only if blockchain storage succeeds, also save metadata to database
      if (blockchainSuccess) {
        console.log("Tender successfully created in blockchain. Now saving metadata to database...");
        
        if (!account) {
          throw new Error("Кошелек не подключен");
        }

        const tenderResponse = await tenderAPI.createTender({
          title,
          description,
          budget,
          deadline: deadline.toISOString(), // Keep using ISO string for the API
          walletAddress: account,
          categories: [form.cargoType]
        });

        if (tenderResponse.error) {
          console.warn(`Warning: Database metadata storage failed: ${tenderResponse.error}`);
          // Continue anyway since blockchain storage succeeded
        }

        // 5. Success message
        console.log("Tender successfully created in blockchain");
        alert("Тендер успешно создан в блокчейне! Он будет доступен " + expirationMinutes + " минут.\nID тендера: " + tenderId);
        router.push('/dashboard');
      } else {
        throw new Error("Не удалось сохранить тендер в блокчейне");
      }
    } catch (error) {
      console.error("Error creating tender:", error);
      alert(`Ошибка создания тендера: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Navbar />
      <h1 className="text-2xl font-bold mb-6">Создать новый тендер</h1>
      
      {walletError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {walletError}
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
        <p>Адрес кошелька: {account || 'Не подключен'}</p>
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
            onClick={async () => {
              if (typeof window !== 'undefined' && window.ethereum) {
                try {
                  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                  alert(`Текущая сеть: ${chainId}\n` + 
                        `- Sepolia Testnet: 0xaa36a7\n` +
                        `- Hardhat Local: 0x7a69\n\n` +
                        `Статус контракта: ${contractTender.isContractAvailable ? 'Доступен' : 'Недоступен'}`);
                } catch (error) {
                  alert('Ошибка при получении информации о сети');
                }
              } else {
                alert('MetaMask не обнаружен');
              }
            }}
            className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none"
          >
            Проверить сеть
          </button>
          
          <button
            onClick={async () => {
              if (typeof window !== 'undefined' && window.ethereum) {
                try {
                  await window.ethereum.request({ 
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0xaa36a7' }] // Sepolia chainId
                  });
                  alert('Переключено на сеть Sepolia');
                  // After switching, try to initialize the contract
                  await contractTender.forceContractInitialization();
                } catch (error: any) {
                  // If Sepolia isn't added to the wallet yet
                  if (error.code === 4902) {
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
                      alert('Добавлена сеть Sepolia. Пожалуйста, попробуйте переключиться снова.');
                    } catch (addError: any) {
                      alert('Ошибка при добавлении сети Sepolia: ' + addError.message);
                    }
                  } else {
                    alert('Ошибка при переключении сети: ' + error.message);
                  }
                }
              } else {
                alert('MetaMask не обнаружен');
              }
            }}
            className="text-xs px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 focus:outline-none"
          >
            Переключиться на Sepolia
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
        <div className="grid grid-cols-1 gap-6">
          {!account && (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:bg-blue-300"
            >
              {isConnecting ? "Подключение..." : "Подключить MetaMask"}
            </button>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Название тендера</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({...form, title: e.target.value})}
              placeholder="Например: Перевозка негабаритного груза"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Расстояние (км)</label>
            <input
              type="number"
              value={form.distance}
              onChange={(e) => setForm({...form, distance: e.target.value})}
              min="50"
              max="2000"
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Вес груза (кг)</label>
            <input
              type="number"
              value={form.weight}
              onChange={(e) => setForm({...form, weight: e.target.value})}
              min="100"
              max="10000"
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Тип груза</label>
            <select
              value={form.cargoType}
              onChange={(e) => setForm({...form, cargoType: e.target.value})}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="general">Обычный</option>
              <option value="fragile">Хрупкий</option>
              <option value="perishable">Скоропортящийся</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Срок доставки (дни)</label>
            <input
              type="number"
              value={form.urgencyDays}
              onChange={(e) => setForm({...form, urgencyDays: e.target.value})}
              min="1"
              max="30"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Бюджет (USD)</label>
            <input
              type="number"
              value={form.budget}
              onChange={(e) => setForm({...form, budget: e.target.value})}
              min="1"
              placeholder="Укажите максимальный бюджет"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Время активности тендера (минуты)</label>
            <div className="flex items-center">
              <input
                type="number"
                value={form.expirationMinutes}
                onChange={(e) => setForm({...form, expirationMinutes: e.target.value})}
                min="1"
                max="1440"
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <div className="ml-2 text-sm text-gray-500">
                Тендер будет активен указанное количество минут
              </div>
            </div>
          </div>

          <PricePredictor 
            distance={form.distance}
            weight={form.weight}
            cargoType={form.cargoType}
            urgencyDays={form.urgencyDays}
          />

          <button 
            onClick={handleCreate} 
            disabled={loading || !account}
            className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:bg-blue-300"
          >
            {loading ? "Создание..." : "Создать тендер"}
          </button>
        </div>
      </div>
    </div>
  );
}