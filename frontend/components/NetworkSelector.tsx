import { useState } from 'react';
import useContractTender from '../hooks/useContractTender';
import { toast } from 'react-hot-toast';

export default function NetworkSelector() {
  const { addHardhatNetworkToMetaMask, forceContractInitialization, isContractAvailable, contractStatus } = useContractTender();
  const [isAdding, setIsAdding] = useState(false);

  const handleAddHardhatNetwork = async () => {
    setIsAdding(true);
    try {
      toast.loading('Добавление сети Hardhat...', { id: 'add-hardhat' });
      const success = await addHardhatNetworkToMetaMask();
      
      if (success) {
        toast.success('Сеть Hardhat успешно добавлена!', { id: 'add-hardhat' });
        // Try to reconnect to contract
        const contractInitialized = await forceContractInitialization();
        if (contractInitialized) {
          toast.success('Подключение к контракту успешно!', { id: 'contract-init' });
        } else {
          toast.error('Не удалось подключиться к контракту', { id: 'contract-init' });
        }
      } else {
        toast.error('Не удалось добавить сеть Hardhat', { id: 'add-hardhat' });
      }
    } catch (error) {
      console.error('Error adding Hardhat network:', error);
      toast.error('Ошибка при добавлении сети Hardhat', { id: 'add-hardhat' });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={handleAddHardhatNetwork}
        disabled={isAdding || isContractAvailable}
        className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md ${
          isContractAvailable 
            ? 'text-green-800 bg-green-100' 
            : 'text-yellow-800 bg-yellow-100 hover:bg-yellow-200'
        } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50`}
      >
        {isContractAvailable ? (
          <span className="flex items-center">
            <span className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></span>
            Контракт доступен
          </span>
        ) : isAdding ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-yellow-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Подключение...
          </span>
        ) : (
          <span className="flex items-center">
            <span className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></span>
            Подключить к Hardhat
          </span>
        )}
      </button>
    </div>
  );
} 