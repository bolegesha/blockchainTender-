import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import Link from 'next/link';
import { memo, useMemo } from 'react';
import { useState } from 'react';
import useContractTender from '../hooks/useContractTender';
import { useWeb3 } from '../hooks/useWeb3';
import { toast } from 'react-hot-toast';

export interface Tender {
  id: string;
  title: string;
  description: string;
  budget: number;
  deadline: string;
  walletAddress?: string;
  categories: Array<string | { id: string; name: string }>;
  status: TenderStatus;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  distance?: number;
  weight?: number;
  bidder?: string;
  fromBlockchain?: boolean;
}

export type TenderStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'COMPLETED' | 'CANCELLED';

interface TenderCardProps {
  tender: Tender;
  isOwner?: boolean;
  timeLeft?: number;
  isUrgent?: boolean;
}

function getStatusText(status: TenderStatus) {
  switch (status) {
    case 'OPEN':
      return 'Открыт';
    case 'CLOSED':
      return 'Закрыт';
    case 'AWARDED':
      return 'В работе';
    case 'COMPLETED':
      return 'Выполнен';
    case 'CANCELLED':
      return 'Отменен';
    default:
      return 'Неизвестно';
  }
}

function getStatusColor(status: TenderStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-green-100 text-green-800';
    case 'CLOSED':
      return 'bg-red-100 text-red-800';
    case 'AWARDED':
      return 'bg-blue-100 text-blue-800';
    case 'COMPLETED':
      return 'bg-purple-100 text-purple-800';
    case 'CANCELLED':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Проверка, из блокчейна ли тендер
const isBlockchainTender = (tender: Tender): boolean => {
  // Сначала проверяем прямое указание
  if (tender.fromBlockchain !== undefined) {
    return tender.fromBlockchain;
  }
  
  // Затем проверяем по ID (для обратной совместимости)
  return /^\d+$/.test(tender.id);
};

// Custom equality function for memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps: TenderCardProps, nextProps: TenderCardProps): boolean => {
  // Check if time left has significantly changed (more than 5 seconds difference) to avoid constant re-renders
  const timeLeftDifference = 
    typeof prevProps.timeLeft === 'number' && 
    typeof nextProps.timeLeft === 'number' 
      ? Math.abs(prevProps.timeLeft - nextProps.timeLeft) 
      : 0;
  
  // Only re-render when time changes by more than 5 seconds
  const isTimeLeftSimilar = timeLeftDifference < 5;
  
  // Basic props comparison
  const isTenderSame = 
    prevProps.tender.id === nextProps.tender.id &&
    prevProps.tender.status === nextProps.tender.status &&
    prevProps.tender.budget === nextProps.tender.budget;
    
  const isOwnershipSame = prevProps.isOwner === nextProps.isOwner;
  const isUrgencySame = prevProps.isUrgent === nextProps.isUrgent;
  
  return isTenderSame && isOwnershipSame && isUrgencySame && isTimeLeftSimilar;
};

// Модальное окно деталей тендера
const TenderDetailsModal = ({ 
  tender, 
  isOpen, 
  onClose, 
  onParticipate 
}: { 
  tender: TenderCardProps, 
  isOpen: boolean, 
  onClose: () => void,
  onParticipate: () => void
}) => {
  const { account } = useWeb3();
  const isCreator = account?.toLowerCase() === tender.tender.walletAddress?.toLowerCase();
  
  if (!isOpen) return null;

  // Извлекаем детали из описания
  const cargoDetails = `Расстояние: ${tender.tender.distance || 0} км, Вес: ${tender.tender.weight || 0} кг, Тип груза: ${tender.tender.categories.find(c => typeof c === 'string') || 'general'}, Срок доставки: ${tender.tender.categories.find(c => typeof c === 'object' && 'urgencyDays' in c) || 1} дней`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold">{tender.tender.title}</h2>
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
            <div className={`text-xs font-medium px-2.5 py-0.5 rounded ${
              tender.tender.status === 'OPEN' ? 'bg-green-100 text-green-800' : 
              tender.tender.status === 'AWARDED' ? 'bg-blue-100 text-blue-800' : 
              tender.tender.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' : 
              tender.tender.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 
              'bg-gray-100 text-gray-800'}`}>
              {tender.tender.status === 'OPEN' ? 'Открыт' : 
               tender.tender.status === 'AWARDED' ? 'Присужден' : 
               tender.tender.status === 'COMPLETED' ? 'Завершен' : 
               tender.tender.status === 'CANCELLED' ? 'Отменен' : 'Закрыт'}
            </div>
            {tender.timeLeft && tender.tender.status === 'OPEN' && (
              <div className="ml-2 text-sm text-yellow-700">
                Осталось: {tender.timeLeft}
              </div>
            )}
          </div>
          
          <p className="text-gray-700 mb-6">{tender.tender.description}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h3 className="text-lg font-semibold mb-2 border-b pb-2">Детали груза</h3>
              <div className="space-y-3">
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Расстояние:</span> 
                  <span>{tender.tender.distance || 0} км</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Вес:</span> 
                  <span>{tender.tender.weight || 0} кг</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Тип груза:</span> 
                  <span>{tender.tender.categories.find(c => typeof c === 'string') || 'general'}</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Срок доставки:</span> 
                  <span>{tender.tender.categories.find(c => typeof c === 'object' && 'urgencyDays' in c) || 1} дней</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Бюджет:</span> 
                  <span>${tender.tender.budget}</span>
                </p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2 border-b pb-2">Информация</h3>
              <div className="space-y-3">
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Создан:</span> 
                  <span>{new Date(tender.tender.createdAt).toLocaleString()}</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Действует до:</span> 
                  <span>{new Date(tender.tender.expiresAt).toLocaleString()}</span>
                </p>
                <p className="flex justify-between">
                  <span className="font-medium text-gray-600">Срок исполнения:</span> 
                  <span>{new Date(tender.tender.deadline).toLocaleString()}</span>
                </p>
                {tender.tender.walletAddress && (
                  <p className="flex justify-between">
                    <span className="font-medium text-gray-600">Создатель:</span> 
                    <span className="font-mono">{tender.tender.walletAddress.substring(0, 6)}...{tender.tender.walletAddress.substring(tender.tender.walletAddress.length - 4)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="border-t pt-4">
            {isCreator ? (
              <div className="bg-blue-50 p-4 rounded">
                <p className="text-blue-800 font-medium">Вы создатель этого тендера</p>
                <p className="text-blue-600 italic text-sm">Вы не можете участвовать в собственном тендере</p>
              </div>
            ) : tender.tender.status === 'OPEN' ? (
              <div className="flex flex-col items-center">
                {!tender.account ? (
                  <Link 
                    href="/connect-wallet" 
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium w-full text-center"
                  >
                    Подключить кошелек для участия
                  </Link>
                ) : (
                  <div className="w-full">
                    <button
                      onClick={onParticipate}
                      className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md font-medium w-full"
                    >
                      Участвовать в тендере
                    </button>
                    <p className="text-sm text-gray-500 text-center mt-2">
                      Перейти к странице тендера для участия
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-4 rounded ${
                tender.tender.status === 'COMPLETED' ? 'bg-green-50 border border-green-200' : 
                tender.tender.status === 'CANCELLED' ? 'bg-red-50 border border-red-200' : 
                'bg-gray-50 border border-gray-200'
              }`}>
                <p className={`font-medium ${
                  tender.tender.status === 'COMPLETED' ? 'text-green-800' : 
                  tender.tender.status === 'CANCELLED' ? 'text-red-800' : 
                  'text-gray-800'
                }`}>
                  Тендер {
                    tender.tender.status === 'COMPLETED' ? 'успешно завершен' : 
                    tender.tender.status === 'CANCELLED' ? 'был отменен' : 
                    'закрыт'
                  }
                </p>
              </div>
            )}
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded mr-2"
              >
                Закрыть
              </button>
              <Link
                href={`/tender/${tender.tender.id}`}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              >
                Перейти на страницу тендера
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize the TenderCard component to prevent unnecessary re-renders
const TenderCard = memo(function TenderCard({ tender, isOwner, timeLeft, isUrgent = false }: TenderCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Format date only when tender.createdAt changes
  const formattedDate = useMemo(() => {
  const createdDate = new Date(tender.createdAt);
    return formatDistanceToNow(createdDate, { addSuffix: true, locale: ru });
  }, [tender.createdAt]);
  
  // Pre-compute blockchain tender check to avoid recalculating in JSX
  const isBlockchain = useMemo(() => isBlockchainTender(tender), [tender.id, tender.fromBlockchain]);
  
  // Format remaining time only when timeLeft changes
  const formattedTimeLeft = useMemo(() => {
    if (timeLeft === undefined || timeLeft <= 0) return null;
    return `${Math.floor(timeLeft / 60)} мин ${timeLeft % 60} сек`;
  }, [timeLeft]);
  
  const handleParticipate = () => {
    // Перенаправляем на страницу тендера
    window.location.href = `/tender/${tender.id}`;
  };
  
  return (
    <>
      <div className={`bg-white rounded-lg shadow-md p-4 mb-4 hover:shadow-lg transition-shadow ${isUrgent ? 'border-l-4 border-red-500' : ''}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">{tender.title}</h3>
        <div className="flex space-x-2">
            {isBlockchain ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Блокчейн
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              База данных
            </span>
          )}
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(tender.status)}`}>
            {getStatusText(tender.status)}
          </span>
        </div>
      </div>
      
      <p className="text-sm text-gray-600 mb-2">{tender.description}</p>
      
        {tender.categories && tender.categories.length > 0 && (
      <div className="flex flex-wrap gap-2 mb-2">
            {tender.categories.map((category, index) => (
          <span key={index} className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-700">
            {typeof category === 'string' ? category : (category && 'name' in category) ? category.name : ''}
          </span>
        ))}
      </div>
        )}
      
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="text-sm text-gray-600">
          <span className="font-medium">Бюджет:</span> ${tender.budget}
        </div>
        {tender.distance && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Расстояние:</span> {tender.distance} км
          </div>
        )}
        {tender.weight && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Вес груза:</span> {tender.weight} кг
          </div>
        )}
        <div className="text-sm text-gray-600">
          <span className="font-medium">Создан:</span> {formattedDate}
        </div>
          {formattedTimeLeft && (
          <div className="text-sm text-gray-600">
              <span className="font-medium">Осталось:</span> {formattedTimeLeft}
          </div>
        )}
      </div>
      
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500 truncate">
          Создатель: {tender.walletAddress?.slice(0, 6)}...{tender.walletAddress?.slice(-4)}
        </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
            Подробнее
          </button>
            
            {tender.status === 'OPEN' && (
              <button
                onClick={handleParticipate}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
              >
                Участвовать
              </button>
            )}
          </div>
        </div>
      </div>
      
      <TenderDetailsModal 
        tender={{
          tender,
          timeLeft,
          account: null,
          isModalOpen,
          setIsModalOpen,
          handleParticipate
        }}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onParticipate={handleParticipate}
      />
    </>
  );
}, arePropsEqual);

export default TenderCard;