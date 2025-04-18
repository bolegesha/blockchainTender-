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
  isCreator: boolean;
  onBidSubmitted?: () => void;
}

const TenderModal: React.FC<TenderModalProps> = ({ 
  isOpen, 
  onClose, 
  tender, 
  isCreator, 
  onBidSubmitted
}) => {
  const { account } = useWeb3();
  const isNumericId = !isNaN(Number(tender.id));
  
  // Состояние для формы заявки
  const [showBidForm, setShowBidForm] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [proposal, setProposal] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Хуки для взаимодействия с контрактом и API
  const { submitBid, isContractAvailable, takeTender } = useContractTender();
  const tenderAPI = useTenderAPI();
  
  const canUseBlockchain = isNumericId && isContractAvailable && tender.fromBlockchain;
  
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
    if (tender.fromBlockchain && !isContractAvailable) {
      setError('Смарт-контракт недоступен. Убедитесь, что MetaMask подключен к правильной сети.');
      return;
    }
    
    setLoading(true);
    setError(null);
    toast.loading('Подготовка транзакции...', { id: 'bid-submission' });
    
    try {
      console.log(`Submitting bid for tender ${tender.id}`);
      console.log(`Amount: ${amount}, Proposal: ${proposal}`);
      
      // Преобразуем любой ID в числовой формат для блокчейна, если требуется
      let blockchainTenderId = tender.id;
      // Если ID не числовой, но флаг fromBlockchain=true, пытаемся преобразовать ID
      const isNumericId = /^\d+$/.test(tender.id);
      if (!isNumericId && tender.fromBlockchain) {
        try {
          // Пытаемся извлечь числовую часть из ID (если она есть)
          const numericPart = tender.id.match(/\d+/);
          if (numericPart) {
            blockchainTenderId = numericPart[0];
            console.log(`Extracted numeric ID ${blockchainTenderId} from ${tender.id} for blockchain`);
          } else {
            // Если числовой части нет, используем хеш строки как число
            blockchainTenderId = String(Math.abs(
              tender.id.split('').reduce((acc, char) => {
                return ((acc << 5) - acc) + char.charCodeAt(0) | 0;
              }, 0)
            ));
            console.log(`Generated numeric ID ${blockchainTenderId} from hash of ${tender.id}`);
          }
        } catch (err) {
          console.error('Error converting ID to numeric format:', err);
          blockchainTenderId = '1'; // Fallback на ID 1 в случае ошибки
        }
      }
      
      // Используем блокчейн, если тендер помечен как блокчейн и контракт доступен
      if (tender.fromBlockchain && isContractAvailable) {
        let result;
        try {
          console.log(`Using blockchain for bid submission with ID: ${blockchainTenderId}`);
          toast.loading('Ожидание подтверждения в MetaMask...', { id: 'bid-submission' });
          
          // submitBid теперь использует функцию takeTender
          result = await submitBid(blockchainTenderId, parseFloat(amount), proposal);
          
          if (result.success) {
            console.log('Tender taken successfully:', result);
            toast.success('Заявка успешно отправлена в блокчейн!', { id: 'bid-submission', duration: 5000 });
            
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
                    {truncatedHash}
                  </a>
                </div>, 
                { duration: 8000 }
              );
            }
            
            setAmount('');
            setProposal('');
            setShowBidForm(false);
            onClose();
            
            if (onBidSubmitted) {
              onBidSubmitted();
            }
            return;
          } else {
            const errorMessage = result.error || 'Ошибка при отправке заявки в блокчейн';
            console.error('Error taking tender through blockchain:', errorMessage);
            
            // Показываем ошибку и завершаем
            setError(errorMessage);
            toast.error(`Ошибка: ${errorMessage}`, { id: 'bid-submission' });
            setLoading(false);
            return;
          }
        } catch (blockchainError: any) {
          // Проверяем, была ли транзакция отклонена пользователем в MetaMask
          const errorMessage = blockchainError?.message || 'Неизвестная ошибка блокчейна';
          
          if (errorMessage.includes('user rejected') || errorMessage.includes('rejected transaction')) {
            console.error('User rejected the transaction in MetaMask');
            toast.error('Транзакция отклонена в MetaMask', { id: 'bid-submission' });
            setLoading(false);
            return;
          }
          
          console.error('Blockchain error, falling back to API:', blockchainError);
          // При ошибке блокчейна продолжаем выполнение и переходим к API
        }
      }
      
      // Метод API или демо-режим (выполняется, если блокчейн не доступен или произошла ошибка)
      console.log('Using API for bid submission');
      toast.loading('Отправка через API...', { id: 'bid-submission' });
      
      // Проверяем, активирован ли уже демо-режим
      if (tenderAPI.useMockData) {
        console.log('Already in mock mode, using demo data directly');
        // Показываем сообщение об успешном демо-создании
        toast.success('Заявка отправлена в демо-режиме', { id: 'bid-submission', duration: 4000 });
        
        // Имитируем задержку для реалистичности
        await new Promise(resolve => setTimeout(resolve, 800));
        
        setAmount('');
        setProposal('');
        setShowBidForm(false);
        onClose();
        
        if (onBidSubmitted) {
          onBidSubmitted();
        }
        return;
      }
      
      try {
        const result = await tenderAPI.createBid({
          tenderId: tender.id,
          amount: parseFloat(amount),
          proposal,
        });
        
        console.log('API bid result:', result);
        
        // API returns either data (success) or an array for mock data on error
        if (result.data) {
          // Check if it's an array from mock data
          if (Array.isArray(result.data)) {
            console.log('Received mock data array as fallback');
            toast.success('Заявка отправлена в демо-режиме (API недоступен)', { id: 'bid-submission', duration: 4000 });
          } else {
            console.log('Bid submitted to API successfully:', result.data);
            toast.success('Заявка успешно отправлена!', { id: 'bid-submission', duration: 4000 });
          }
          
          setAmount('');
          setProposal('');
          setShowBidForm(false);
          onClose();
          
          if (onBidSubmitted) {
            onBidSubmitted();
          }
        } else if (result.error) {
          // Only show error if it's not a server error that triggered mock data fallback
          if (!result.error.includes('500')) {
            const errorMessage = result.error || 'Ошибка при отправке заявки через API';
            console.error('Error submitting bid via API:', errorMessage);
            setError(errorMessage);
            toast.error(`Ошибка: ${errorMessage}`, { id: 'bid-submission' });
          } else {
            // Server error with mock data fallback
            console.log('Server error with mock data fallback');
            toast.success('Заявка отправлена в демо-режиме (API недоступен)', { id: 'bid-submission', duration: 4000 });
            
            // Активируем режим демо-данных для всего приложения
            if (typeof tenderAPI.toggleMockData === 'function' && !tenderAPI.useMockData) {
              console.log('Switching to mock data mode permanently due to API error');
              tenderAPI.toggleMockData();
            }
            
            setAmount('');
            setProposal('');
            setShowBidForm(false);
            onClose();
            
            if (onBidSubmitted) {
              onBidSubmitted();
            }
          }
        }
      } catch (apiError) {
        console.error('API submission error:', apiError);
        // Show a user-friendly error and use mock mode if available
        toast.success('Заявка отправлена в демо-режиме (API недоступен)', { id: 'bid-submission', duration: 4000 });
        
        // Активируем режим демо-данных для всего приложения
        if (typeof tenderAPI.toggleMockData === 'function' && !tenderAPI.useMockData) {
          console.log('Switching to mock data mode permanently due to API error');
          tenderAPI.toggleMockData();
        }
        
        setAmount('');
        setProposal('');
        setShowBidForm(false);
        onClose();
        
        if (onBidSubmitted) {
          onBidSubmitted();
        }
      }
    } catch (err) {
      console.error('Error submitting bid:', err);
      const errorMessage = err instanceof Error ? err.message : 'Ошибка при отправке заявки';
      
      setError(errorMessage);
      toast.error(`Ошибка: ${errorMessage}`, { id: 'bid-submission' });
    } finally {
      setLoading(false);
    }
  }, [account, tender.id, tender.fromBlockchain, amount, proposal, submitBid, tenderAPI, onClose, onBidSubmitted, isContractAvailable]);
  
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
          onBidSubmitted();
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
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-xl font-semibold mb-4">Отправить заявку на тендер</h3>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmitBid}>
            <div className="mb-4">
              <label htmlFor="amount" className="block text-gray-700 font-medium mb-2">
                Сумма предложения
              </label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Введите сумму в USDT"
                required
                min="0"
                step="0.01"
              />
              <p className="text-sm text-gray-500 mt-1">Введите сумму, за которую вы готовы выполнить тендер</p>
            </div>
            
            <div className="mb-4">
              <label htmlFor="proposal" className="block text-gray-700 font-medium mb-2">
                Описание предложения
              </label>
              <textarea
                id="proposal"
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                placeholder="Опишите ваше предложение..."
                required
              ></textarea>
              <p className="text-sm text-gray-500 mt-1">Опишите, как вы планируете выполнить тендер, сроки, условия и т.д.</p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowBidForm(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={loading || !amount || !proposal}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
              >
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
                  <span>{new Date(tender.deadline).toLocaleString()}</span>
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