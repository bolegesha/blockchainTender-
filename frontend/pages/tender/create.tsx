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
      
      // Only try to save to blockchain if contract is available
      if (contractTender.isContractAvailable) {
        console.log("Sending to blockchain with deadline timestamp:", deadlineTimestamp);
        
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
            blockchainSuccess = false;
            blockchainError = new Error("Не удалось получить ID тендера из блокчейна");
          }
        } else {
          blockchainError = new Error(contractResponse.error || "Unknown blockchain error");
          console.error("Blockchain error:", contractResponse.error);
        }
      } else {
        console.log("Blockchain contract not available, skipping blockchain storage");
        blockchainError = new Error("Smart contract is not available or properly deployed");
      }

      // 4. Save metadata to database (даже если блокчейн не сработал)
      console.log("Saving tender metadata to database...");
      
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
        throw new Error(`Ошибка сохранения метаданных: ${tenderResponse.error}`);
      }

      // 5. Handle success/partial success
      if (blockchainSuccess) {
        console.log("Tender successfully created in both blockchain and database");
        alert("Тендер успешно создан! Он будет доступен " + expirationMinutes + " минут.");
      } else {
        console.log("Tender created in database only");
        alert("Тендер сохранен в базе данных, но произошла ошибка при сохранении в блокчейн: " + 
          (blockchainError ? blockchainError.message : "Неизвестная ошибка"));
      }

      router.push('/dashboard');
    } catch (error) {
      console.error("Error creating tender:", error);
      
      // 6. Handle different error scenarios
      if (blockchainError) {
        alert(`Ошибка создания тендера в блокчейне: ${blockchainError.message}`);
      } else {
        alert(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      }
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
        <p>Доступность контракта: {contractTender.isContractAvailable ? 'Доступен' : 'Недоступен'}</p>
        <p>Ошибка контракта: {contractTender.error || 'Нет'}</p>
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