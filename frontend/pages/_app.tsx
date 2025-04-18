import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';

export default function App({ Component, pageProps }: AppProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check initial online status
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    // Add event listeners for online/offline status
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Подключение к сети восстановлено!');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Отсутствует подключение к интернету. Некоторые функции могут быть недоступны.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '8px', 
            background: '#333', 
            color: '#fff',
          },
        }}
      />
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 z-50">
          Вы не подключены к интернету. Работаем в оффлайн режиме.
        </div>
      )}
      <Component {...pageProps} />
    </>
  );
} 