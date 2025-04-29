import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useWeb3 } from '../hooks/useWeb3';
import useContractTender from '../hooks/useContractTender';
import useTenderAPI from '../hooks/useTenderAPI';
import { toast } from 'react-hot-toast';

export type TenderStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'COMPLETED' | 'CANCELLED';

export interface TenderDetails {
  id: string;
  title: string;
  description: string;
  budget: number;
  deadline: string;
  status: TenderStatus;
  createdAt: string;
  expiresAt?: string;
  distance?: number;
  weight?: number;
  cargoType?: string;
  urgencyDays?: number;
  creator?: string;
  timeLeft?: string;
  fromBlockchain?: boolean;
}

interface TenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDetails;
  isCreator?: boolean;
  onBidSubmitted?: () => Promise<void>;
  forcedBlockchainMode?: boolean;
}

const TenderModal: React.FC<TenderModalProps> = ({ 
  isOpen, 
  onClose, 
  tender, 
  isCreator = false, 
  onBidSubmitted = async () => {},
  forcedBlockchainMode = true
}) => {
  const { account } = useWeb3();
  const isNumericId = !isNaN(Number(tender.id));
  
  // Состояние для формы заявки
  const [showBidForm, setShowBidForm] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [proposal, setProposal] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bidSubmissionError, setBidSubmissionError] = useState<string | null>(null);
  
  // Хуки для взаимодействия с контрактом и API
  const { submitBid, isContractAvailable, takeTender, getTender, createTender } = useContractTender();
  const tenderAPI = useTenderAPI();
  
  // Всегда пытаемся использовать блокчейн, если он доступен
  const canUseBlockchain = isContractAvailable && (isNumericId || forcedBlockchainMode);
  
  // Функция для проверки существования тендера перед отправкой заявки
  const checkTenderExists = useCallback(async (id: string): Promise<boolean> => {
    try {
      console.log(`Checking if tender ${id} exists in blockchain...`);
      
      // Make a safe call that catches the revert error instead of letting it bubble up
      try {
        const response = await getTender(id);
        return response.success && !!response.data; // True if the request was successful and data exists
      } catch (error: any) {
        // If we get here, the contract call itself threw an error
        console.error(`Contract error checking tender existence:`, error);
        
        // Check if the error is specifically about tender not existing
        if (error.message && (
          error.message.includes('Tender does not exist') ||
          (error.reason && error.reason.includes('Tender does not exist'))
        )) {
          console.warn(`Caught 'Tender does not exist' error - tender ${id} confirmed not to exist`);
          return false; // Tender definitely doesn't exist
        }
        
        // For other errors, it's safer to fail the check
        return false;
      }
    } catch (error) {
      console.error(`Error in checkTenderExists wrapper:`, error);
      return false;
    }
  }, [getTender]);
  
  const handleSubmitBid = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!account) {
      setError('Пожалуйста, подключите кошелек');
      return;
    }
    
    if (!amount || !proposal) {
      setError('Пожалуйста, заполните все поля');
      return;
    }

    // Check if contract is available for blockchain tenders
    if (!isContractAvailable) {
      setError('Смарт-контракт недоступен. Убедитесь, что MetaMask подключен к правильной сети.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setBidSubmissionError(null);
    toast.loading('Подготовка транзакции...', { id: 'bid-submission' });
    
    try {
      console.log(`Taking tender ${tender.id}`);
      console.log(`Amount: ${amount}, Proposal: ${proposal}`);
      
      // Преобразуем любой ID в числовой формат для блокчейна
      let blockchainTenderId = tender.id;
      // Если ID не числовой, пытаемся преобразовать
      const isNumericId = /^\d+$/.test(tender.id);
      if (!isNumericId) {
        try {
          // Пытаемся извлечь числовую часть из ID (если она есть)
          // Исправляем регулярное выражение, чтобы искать только последовательности цифр длиной 4 и более
          const numericPart = tender.id.match(/\d{4,}/);
          if (numericPart && parseInt(numericPart[0]) > 0) {
            blockchainTenderId = numericPart[0];
            console.log(`Extracted numeric ID ${blockchainTenderId} from ${tender.id} for blockchain`);
          } else {
            // Генерируем стабильный положительный ID на основе хеша строки
            let hashCode = 1000; // начинаем с более крупного положительного значения
            for (let i = 0; i < tender.id.length; i++) {
              // Используем метод хеширования для получения консистентного числа
              hashCode = ((hashCode << 5) - hashCode) + tender.id.charCodeAt(i);
              hashCode = hashCode & hashCode; // Конвертируем в 32-битное целое
            }
            // Убеждаемся, что ID положительный и в разумном диапазоне (10000 до 1000000)
            blockchainTenderId = (Math.abs(hashCode) % 990000 + 10000).toString();
            
            // Дополнительная проверка, чтобы убедиться, что ID не равен 0
            if (blockchainTenderId === '0' || parseInt(blockchainTenderId) <= 0) {
              blockchainTenderId = '10001'; // Безопасное значение по умолчанию
            }
            
            console.log(`Generated numeric ID ${blockchainTenderId} from hash of "${tender.id}" for blockchain`);
          }
        } catch (err) {
          console.error('Error converting ID to numeric format:', err);
          const errorMsg = `Ошибка при конвертации ID: ${err instanceof Error ? err.message : 'Unknown error'}`;
          setBidSubmissionError(errorMsg);
          toast.error(errorMsg, { id: 'bid-submission' });
          setLoading(false);
          return;
        }
      }
      
      // Double-check the numeric ID is valid
      if (!blockchainTenderId || isNaN(Number(blockchainTenderId)) || Number(blockchainTenderId) <= 0) {
        const errorMsg = `Недопустимый ID тендера: ${blockchainTenderId}. ID должен быть положительным числом.`;
        setBidSubmissionError(errorMsg);
        toast.error(errorMsg, { id: 'bid-submission' });
        setLoading(false);
        return;
      }
      
      // Перед отправкой заявки, дополнительно проверяем, существует ли тендер
      console.log(`Double-checking tender existence with ID: ${blockchainTenderId}`);

      // Всегда используем блокчейн, если контракт доступен
      if (isContractAvailable) {
        let result;
        try {
          console.log(`Using blockchain for taking tender with ID: ${blockchainTenderId}`);
          toast.loading('Ожидание подтверждения в MetaMask...', { id: 'bid-submission' });
          
          // If tender ID is 0, attempt to use the tender count to get a valid ID
          if (blockchainTenderId === '0') {
            try {
              const contractInstance = await window.ethereum.request({
                method: 'eth_call',
                params: [{
                  to: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
                  data: '0x05062247' // Function selector for tenderCount()
                }, 'latest']
              });
              
              // Parse the hex result to get the tender count
              const count = parseInt(contractInstance, 16);
              if (count > 0) {
                // Use the latest tender ID (count - 1)
                blockchainTenderId = (count - 1).toString();
                console.log(`Using last tender ID: ${blockchainTenderId} instead of 0`);
              } else {
                throw new Error('No tenders found in the contract');
              }
            } catch (countError) {
              console.error('Error getting tender count:', countError);
              throw new Error('Cannot submit bid for ID 0. Please use a valid tender ID.');
            }
          }
          
          // First check if the tender exists in the blockchain
          const tenderExists = await checkTenderExists(blockchainTenderId);
          
          // Additional check to see if you're the creator before attempting submission
          if (tenderExists) {
            const tenderDetails = await getTender(blockchainTenderId);
            if (tenderDetails.success && tenderDetails.data) {
              const tenderCreator = tenderDetails.data.creator.toLowerCase();
              const currentAccount = account?.toLowerCase();
              
              console.log(`Comparing accounts for tender ${blockchainTenderId}:`, {
                original: {
                  creator: tenderDetails.data.creator,
                  account: account
                },
                lowercase: {
                  creator: tenderCreator,
                  account: currentAccount
                },
                equal: tenderCreator === currentAccount
              });
              
              if (tenderCreator === currentAccount) {
                const errorMsg = 'Вы не можете участвовать в своем собственном тендере. Пожалуйста, используйте другой аккаунт MetaMask.';
                toast.error(errorMsg, { id: 'bid-submission' });
                setBidSubmissionError(errorMsg);
                setLoading(false);
                return;
              }
            }
          }
          
          // Если тендер не существует в блокчейне, но у нас есть детали тендера из базы данных,
          // попробуем создать его в блокчейне
          if (!tenderExists && tender) {
            console.log(`Tender ${blockchainTenderId} doesn't exist in blockchain. Attempting to migrate it from database.`);
            toast.loading('Тендер не найден в блокчейне. Попытка миграции из базы данных...', { id: 'bid-submission' });
            
            try {
              // Создаем дату дедлайна
              const deadlineDate = new Date(tender.deadline);
              const deadlineTimestamp = Math.floor(deadlineDate.getTime() / 1000);
              
              // Создаем дату истечения (по умолчанию +1 день)
              const expirationMinutes = 1440; // 24 часа
              
              // Получаем нужные числовые параметры
              const distance = tender.distance || 100;
              const weight = tender.weight || 100;
              const cargoType = tender.cargoType || "general";
              const urgencyDays = tender.urgencyDays || 7;
              
              console.log(`Attempting to create tender in blockchain with params:`, {
                id: blockchainTenderId,
                title: tender.title,
                description: tender.description,
                budget: tender.budget,
                deadline: deadlineTimestamp,
                distance, weight, cargoType, urgencyDays, expirationMinutes
              });
              
              // Вызываем функцию создания тендера в блокчейне
              const createResult = await createTender(
                tender.title,
                tender.description,
                tender.budget,
                deadlineTimestamp,
                distance,
                weight,
                cargoType,
                urgencyDays,
                expirationMinutes
              );
              
              if (createResult.success) {
                console.log(`Successfully migrated tender to blockchain with ID: ${createResult.data?.id}`);
                toast.success('Тендер успешно мигрирован в блокчейн!', { id: 'bid-submission' });
                
                // Используем новый ID из блокчейна
                blockchainTenderId = createResult.data?.id || blockchainTenderId;
              } else {
                throw new Error(`Failed to migrate tender: ${createResult.error}`);
              }
            } catch (migrationErr: any) {
              console.error('Error migrating tender to blockchain:', migrationErr);
              throw new Error(`Не удалось мигрировать тендер в блокчейн: ${migrationErr.message}`);
            }
          } else if (!tenderExists) {
            throw new Error(`Tender with ID ${blockchainTenderId} does not exist in the blockchain. It may have been removed or never existed.`);
          }
          
          // Вызываем функцию для блокчейна - теперь используем submitBid, которая вызывает takeTender
          // Дополнительная проверка перед отправкой
          const numericId = parseInt(blockchainTenderId);
          if (isNaN(numericId) || numericId <= 0) {
            throw new Error(`Недопустимый ID тендера: ${blockchainTenderId}. ID должен быть положительным числом.`);
          }
          
          result = await submitBid(blockchainTenderId, parseFloat(amount), proposal);
          
          if (result.success) {
            console.log('Tender taken successfully:', result);
            toast.success('Вы успешно взяли тендер в работу!', { id: 'bid-submission', duration: 5000 });
            
            // Показать hash транзакции, если доступен
            if (result.hash) {
              const txHash = result.hash;
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
                    Посмотреть транзакцию {truncatedHash}
                  </a>
                </div>,
                { id: 'tx-success', duration: 10000 }
              );
            }
            
            // Закрываем модальное окно
            setAmount('');
            setProposal('');
            onClose();
            
            // Обновляем страницу родителя
            if (onBidSubmitted) {
              await onBidSubmitted();
            }
          } else {
            throw new Error(result.error || 'Неизвестная ошибка при отправке заявки');
          }
        } catch (err: any) {
          console.error('Error taking tender:', err);
          
          // Формируем понятное сообщение об ошибке для пользователя
          let errorMessage = 'Произошла ошибка при взятии тендера в работу';
          
          if (err.message) {
            if (err.message.includes('user rejected transaction')) {
              errorMessage = 'Вы отменили транзакцию';
            } else if (err.message.includes('Tender does not exist')) {
              errorMessage = 'Тендер не существует в блокчейне';
            } else if (err.message.includes('Cannot take your own tender')) {
              errorMessage = 'Вы не можете взять в работу свой собственный тендер';
              
              // Check if addresses are different in casing but same value
              let reportedCreator = '';
              if (tender.creator && account) {
                reportedCreator = tender.creator;
                const sameAddressDifferentCase = 
                  tender.creator.toLowerCase() === account.toLowerCase() &&
                  tender.creator !== account;
                
                if (sameAddressDifferentCase) {
                  console.log('Detected same address with different case:', {
                    reported: tender.creator,
                    account: account,
                    sameWhenLowercase: tender.creator.toLowerCase() === account.toLowerCase()
                  });
                  errorMessage += '. Адрес тендера и ваш адрес совпадают, но имеют разный регистр букв.';
                  
                  // Update UI with more helpful message
                  toast.error(
                    <div>
                      <p className="font-bold">Это ваш тендер, но адреса записаны по-разному</p>
                      <p className="text-sm mt-1">Ваш адрес: {account}</p>
                      <p className="text-sm">Адрес создателя: {tender.creator}</p>
                      <p className="text-sm mt-2">Эти адреса считаются одинаковыми в блокчейне</p>
                    </div>,
                    { id: 'owner-error', duration: 10000 }
                  );
                }
              }
              
              // If this is owner account error, add more details
              toast.error(
                <div>
                  <p className="font-bold">Вы не можете взять свой собственный тендер</p>
                  <p className="text-sm mt-1">Пожалуйста, переключитесь на другой аккаунт в MetaMask</p>
                </div>,
                { id: 'owner-error', duration: 8000 }
              );
              
              // Debug info in console
              console.error('Owner account error:', {
                tenderCreator: tender.creator,
                currentAccount: account,
                tenderId: tender.id,
                numericId: blockchainTenderId
              });
            } else if (err.message.includes('Tender is not open')) {
              errorMessage = 'Тендер уже не открыт для участия';
            } else if (err.message.includes('Tender has expired')) {
              errorMessage = 'Срок действия тендера истек';
            } else {
              errorMessage = `Ошибка: ${err.message}`;
            }
          }
          
          setBidSubmissionError(errorMessage);
          toast.error(errorMessage, { id: 'bid-submission' });
        }
      } else {
        // Блокчейн недоступен - показываем ошибку
        const errorMessage = 'Смарт-контракт недоступен. Проверьте подключение к MetaMask.';
        setError(errorMessage);
        toast.error(errorMessage, { id: 'bid-submission' });
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('Error submitting bid:', err);
      const errorMessage = err instanceof Error ? err.message : 'Ошибка при отправке заявки';
      
      setError(errorMessage);
      toast.error(`Ошибка: ${errorMessage}`, { id: 'bid-submission' });
    } finally {
      setLoading(false);
    }
  }, [account, tender.id, amount, proposal, submitBid, onClose, onBidSubmitted, isContractAvailable, checkTenderExists]);
  
  const handleTakeTender = useCallback(async () => {
    if (!account) {
      setError('Пожалуйста, подключите кошелек');
      return;
    }
    
    if (!tender.fromBlockchain) {
      setError('Функция "Забрать тендер" доступна только для тендеров в блокчейне');
      return;
    }
    
    if (!isContractAvailable) {
      setError('Смарт-контракт недоступен. Убедитесь, что MetaMask подключен к правильной сети.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Taking tender ${tender.id}`);
      const result = await takeTender(tender.id);
      
      if (result && result.success) {
        console.log('Tender taken successfully');
        toast.success('Вы успешно забрали тендер!');
        onClose();
        if (onBidSubmitted) {
          await onBidSubmitted();
        }
      } else {
        setError(result?.error || 'Ошибка при взятии тендера');
      }
    } catch (err) {
      console.error('Error taking tender:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при взятии тендера');
      toast.error(`Ошибка: ${err instanceof Error ? err.message : 'Не удалось взять тендер'}`);
    } finally {
      setLoading(false);
    }
  }, [account, tender.id, tender.fromBlockchain, takeTender, isContractAvailable, onClose, onBidSubmitted]);
  
  if (!isOpen) return null;
  
  const getStatusText = (status: TenderStatus) => {
    switch (status) {
      case 'OPEN': return 'Открыт';
      case 'AWARDED': return 'Присужден';
      case 'COMPLETED': return 'Завершен';
      case 'CANCELLED': return 'Отменен';
      case 'CLOSED': return 'Закрыт';
      default: return status;
    }
  };
  
  const getStatusClass = (status: TenderStatus) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800';
      case 'AWARDED': return 'bg-blue-100 text-blue-800';
      case 'COMPLETED': return 'bg-purple-100 text-purple-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      case 'CLOSED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getCargoTypeText = (type?: string) => {
    if (!type) return 'Обычный';
    switch (type) {
      case 'general': return 'Обычный';
      case 'fragile': return 'Хрупкий';
      case 'perishable': return 'Скоропортящийся';
      default: return type;
    }
  };
  
  const renderParticipationButtons = () => {
    if (!account) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
          <p className="text-yellow-800 mb-2">Для участия необходимо подключить кошелек</p>
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium w-full text-center"
            onClick={() => window.location.href = "/connect-wallet"}
          >
            Подключить кошелек
          </button>
        </div>
      );
    }
    
    if (isCreator) {
      return (
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-blue-800 font-medium">Вы создатель этого тендера</p>
          <p className="text-blue-600 italic text-sm">Вы не можете участвовать в собственном тендере</p>
        </div>
      );
    }
    
    if (showBidForm) {
      return (
        <div className="mt-6 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900">Подать заявку</h3>
          <form onSubmit={handleSubmitBid} className="mt-4 space-y-4">
            <div>
              <label htmlFor="bid-amount" className="block text-sm font-medium text-gray-700">
                Сумма (USD)
              </label>
              <input
                type="number"
                id="bid-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Введите вашу ставку"
                min="1"
                required
              />
            </div>
            
            <div>
              <label htmlFor="bid-proposal" className="block text-sm font-medium text-gray-700">
                Предложение
              </label>
              <textarea
                id="bid-proposal"
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={4}
                placeholder="Опишите ваше предложение"
                required
              />
            </div>
            
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}
            
            {bidSubmissionError && (
              <div className="rounded-md bg-yellow-50 p-4 border border-yellow-300 shadow-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-yellow-800">Проблема с отправкой заявки</h3>
                    <p className="text-sm text-yellow-700 mt-1 font-semibold">{bidSubmissionError}</p>
                    
                    {bidSubmissionError?.includes('не существует') && (
                      <div className="mt-2">
                        <div className="text-sm text-yellow-700">
                          <p className="font-medium">Возможные причины:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Тендер был закрыт или отменен создателем</li>
                            <li>Тендер был удален из блокчейна</li>
                            <li>Вы используете устаревшие данные</li>
                            <li>ID тендера не соответствует контракту</li>
                          </ul>
                          <p className="mt-2 font-medium">Рекомендуемые действия:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Обновите страницу для получения актуальных данных</li>
                            <li>Проверьте список доступных тендеров</li>
                            <li>Если ошибка повторяется, вернитесь на главную страницу</li>
                          </ul>
                        </div>
                        <div className="mt-4 text-sm bg-gray-100 p-3 rounded border border-gray-300">
                          <p className="font-semibold text-gray-700">Техническая информация:</p>
                          <div className="mt-1 font-mono text-xs text-gray-600 overflow-auto max-h-32">
                            <p>Tender ID: {tender.id}</p>
                            <p>Contract Available: {isContractAvailable ? 'Yes' : 'No'}</p>
                            <p>Blockchain Mode: {tender.fromBlockchain ? 'Yes' : 'No'}</p>
                            <p>Numeric ID: {isNumericId ? 'Yes' : 'No'}</p>
                            <p>Contract Address: {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}</p>
                            <p>Error Timestamp: {new Date().toISOString()}</p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button 
                              onClick={() => window.location.reload()}
                              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded"
                            >
                              Обновить страницу
                            </button>
                            {!isContractAvailable && (
                              <button 
                                onClick={() => {
                                  toast.loading('Переподключение к смарт-контракту...', { id: 'contract-reconnect' });
                                  // Пытаемся переподключиться к смарт-контракту
                                  if (typeof window !== 'undefined' && window.ethereum) {
                                    // Запрашиваем подключение к MetaMask
                                    window.ethereum.request({ method: 'eth_requestAccounts' })
                                      .then(() => {
                                        return window.ethereum.request({ 
                                          method: 'wallet_switchEthereumChain',
                                          params: [{ chainId: '0xaa36a7' }] // Sepolia chainId
                                        });
                                      })
                                      .then(() => {
                                        // После переключения сети проверяем статус контракта
                                        setTimeout(() => {
                                          if (isContractAvailable) {
                                            toast.success('Смарт-контракт успешно подключен!', { id: 'contract-reconnect' });
                                          } else {
                                            toast.error('Не удалось подключиться к смарт-контракту. Попробуйте обновить страницу.', { id: 'contract-reconnect' });
                                          }
                                        }, 1500);
                                      })
                                      .catch((err: Error) => {
                                        console.error('Error reconnecting to contract:', err);
                                        toast.error(`Ошибка: ${err.message || 'Не удалось переподключиться'}`, { id: 'contract-reconnect' });
                                      });
                                  } else {
                                    toast.error('MetaMask не установлен!', { id: 'contract-reconnect' });
                                  }
                                }}
                                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded flex items-center"
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                </svg>
                                Переподключить контракт
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {bidSubmissionError?.includes('контракт') && !bidSubmissionError?.includes('не существует') && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button 
                          onClick={() => {
                            // Пытаемся переподключиться к смарт-контракту
                            toast.loading('Переподключение к смарт-контракту...', { id: 'contract-reconnect' });
                            if (typeof window !== 'undefined' && window.ethereum) {
                              // Запрашиваем подключение к MetaMask
                              window.ethereum.request({ method: 'eth_requestAccounts' })
                                .then(() => {
                                  return window.ethereum.request({ 
                                    method: 'wallet_switchEthereumChain',
                                    params: [{ chainId: '0xaa36a7' }] // Sepolia chainId
                                  });
                                })
                                .then(() => {
                                  // После переключения сети проверяем статус контракта
                                  setTimeout(() => {
                                    if (isContractAvailable) {
                                      toast.success('Смарт-контракт успешно подключен!', { id: 'contract-reconnect' });
                                    } else {
                                      toast.error('Не удалось подключиться к смарт-контракту. Попробуйте обновить страницу.', { id: 'contract-reconnect' });
                                    }
                                  }, 1500);
                                })
                                .catch((err: Error) => {
                                  console.error('Error reconnecting to contract:', err);
                                  toast.error(`Ошибка: ${err.message || 'Не удалось переподключиться'}`, { id: 'contract-reconnect' });
                                });
                            } else {
                              toast.error('MetaMask не установлен!', { id: 'contract-reconnect' });
                            }
                          }}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded flex items-center"
                        >
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                          </svg>
                          Переподключить контракт
                        </button>
                        <button 
                          onClick={() => window.location.reload()}
                          className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded flex items-center"
                        >
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                          Обновить страницу
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowBidForm(false)}
                className="mr-2 inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={loading || !account}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {loading ? 'Отправка...' : 'Отправить заявку'}
              </button>
            </div>
          </form>
        </div>
      );
    }
    
    // Блок для обычной формы участия
    return (
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-green-50 p-6 rounded-lg border border-green-200 mb-4 shadow-sm">
        <div>
          <h3 className="font-semibold text-green-800 text-lg mb-2">Участвовать в тендере</h3>
          <p className="text-green-700">
            {tender.fromBlockchain 
              ? "Этот тендер создан в блокчейне. Вы можете забрать его или отправить заявку с вашей ценой."
              : "Этот тендер создан в базе данных. Вы можете отправить заявку с вашей ценой."}
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          {tender.fromBlockchain && isContractAvailable && (
            <button
              onClick={handleTakeTender}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md disabled:bg-gray-300 font-medium flex-1 md:flex-none"
            >
              {loading ? 'Обработка...' : 'Забрать тендер'}
            </button>
          )}
          <button
            onClick={() => setShowBidForm(true)}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md font-medium flex-1 md:flex-none"
          >
            Отправить заявку
          </button>
        </div>
      </div>
    );
  };
  
  // Функция для отображения информации о блокчейне
  const renderBlockchainInfo = () => {
    return (
      <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
        <div className="flex justify-between items-start">
          <div>
            <p>
              Статус смарт-контракта: {isContractAvailable ? 
                <span className="text-green-600 font-semibold">Доступен</span> : 
                <span className="text-red-600 font-semibold">Недоступен</span>}
            </p>
            <p>ID тендера: <span className="font-mono">{tender.id}</span> ({isNumericId ? 'числовой' : 'не числовой'})</p>
            <p>Источник данных: {tender.fromBlockchain ? 
              <span className="text-blue-600">Блокчейн</span> : 
              <span className="text-purple-600">База данных</span>}
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button 
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Обновить
            </button>
          </div>
        </div>
        
        {!isContractAvailable && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded">
            <p className="text-amber-700 mb-1 text-xs font-medium">Для отправки заявки требуется подключение к смарт-контракту</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button 
                onClick={() => {
                  toast.loading('Подключение к смарт-контракту...', { id: 'contract-connect' });
                  // Пытаемся переподключиться к смарт-контракту
                  if (typeof window !== 'undefined' && window.ethereum) {
                    // Запрашиваем подключение к MetaMask
                    window.ethereum.request({ method: 'eth_requestAccounts' })
                      .then(() => {
                        return window.ethereum.request({ 
                          method: 'wallet_switchEthereumChain',
                          params: [{ chainId: '0xaa36a7' }] // Sepolia chainId
                        });
                      })
                      .then(() => {
                        // После переключения сети проверяем статус контракта
                        return new Promise(resolve => {
                          setTimeout(() => {
                            resolve(true);
                          }, 1000);
                        });
                      })
                      .then(() => {
                        if (isContractAvailable) {
                          toast.success('Смарт-контракт успешно инициализирован!', { id: 'contract-connect' });
                        } else {
                          toast.error('Не удалось подключиться к смарт-контракту. Обновите страницу.', { id: 'contract-connect' });
                        }
                      })
                      .catch((err: Error) => {
                        console.error('Error connecting to MetaMask:', err);
                        toast.error(`Ошибка: ${err.message}`, { id: 'contract-connect' });
                      });
                  } else {
                    toast.error('MetaMask не установлен!', { id: 'contract-connect' });
                  }
                }}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Подключить MetaMask
              </button>
              
              <button 
                onClick={() => window.location.reload()}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Обновить страницу
              </button>
              
              <button 
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Вернуться на главную
              </button>
            </div>
          </div>
        )}
        
        {tender.fromBlockchain && process.env.NEXT_PUBLIC_CONTRACT_ADDRESS && (
          <div className="mt-2 text-xs text-gray-500">
            <p>Адрес контракта: <a 
              href={`https://sepolia.etherscan.io/address/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}
            </a></p>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold">{tender.title}</h2>
            <button 
              onClick={onClose} 
              className="text-gray-400 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Blockchain status indicator */}
          <div className="flex items-center mb-4 text-sm">
            <div className={`px-2 py-0.5 rounded-full flex items-center ${
              isContractAvailable 
                ? 'bg-green-100 text-green-800' 
                : 'bg-amber-100 text-amber-800'
            }`}>
              <span className={`h-2 w-2 rounded-full mr-1.5 ${
                isContractAvailable ? 'bg-green-500' : 'bg-amber-500'
              }`}></span>
              <span>
                {isContractAvailable 
                  ? 'Смарт-контракт доступен' 
                  : 'Смарт-контракт недоступен'}
              </span>
            </div>
            
            {tender.fromBlockchain && (
              <div className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Блокчейн
              </div>
            )}
          </div>
          
          <div className="mb-4 flex items-center">
            <div className={`text-xs font-medium px-2.5 py-0.5 rounded ${getStatusClass(tender.status)}`}>
              {getStatusText(tender.status)}
            </div>
            {tender.timeLeft && tender.status === 'OPEN' && (
              <div className="ml-2 text-sm text-yellow-700">
                Осталось: {tender.timeLeft}
              </div>
            )}
          </div>
          
          <p className="text-gray-700 mb-6">{tender.description}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h3 className="text-lg font-semibold mb-2 border-b pb-2">Детали груза</h3>
              <div className="space-y-3">
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Расстояние:</span> 
                  <span>{tender.distance || 0} км</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Вес:</span> 
                  <span>{tender.weight || 0} кг</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Тип груза:</span> 
                  <span>{getCargoTypeText(tender.cargoType)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Срок доставки:</span> 
                  <span>{tender.urgencyDays || 1} дней</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Бюджет:</span> 
                  <span>${tender.budget}</span>
                </p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2 border-b pb-2">Информация</h3>
              <div className="space-y-3">
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Создан:</span> 
                  <span>{new Date(tender.createdAt).toLocaleString()}</span>
                </p>
                {tender.expiresAt && (
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Действует до:</span> 
                    <span>{new Date(tender.expiresAt).toLocaleString()}</span>
                  </p>
                )}
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Срок исполнения:</span> 
                  <span>{typeof tender.deadline === 'bigint' 
                    ? new Date(Number(tender.deadline) * 1000).toLocaleString() 
                    : new Date(tender.deadline).toLocaleString()}</span>
                </p>
                {tender.creator && (
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Создатель:</span> 
                    <span className="font-mono">{tender.creator.substring(0, 6)}...{tender.creator.substring(tender.creator.length - 4)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {/* Display blockchain information */}
          {renderBlockchainInfo()}
          
          <div className="border-t pt-4">
            {renderParticipationButtons()}
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded mr-2"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenderModal; 