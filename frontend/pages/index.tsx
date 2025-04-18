import Link from 'next/link';
import Navbar from '../components/Navbar';
import { useWeb3 } from '../hooks/useWeb3';

export default function Home() {
  const { account, connectWallet, isConnecting } = useWeb3();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">
            Тендерная платформа для грузоперевозок
          </h1>
          
          <p className="text-xl text-gray-600 mb-12">
            Создавайте тендеры, участвуйте в торгах и находите оптимальные решения для ваших грузоперевозок
          </p>

          {!account ? (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="mb-8 inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {isConnecting ? "Подключение..." : "Подключить MetaMask"}
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <Link 
                href="/tender/create"
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Создать тендер
              </Link>
              <Link 
                href="/dashboard"
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Мой кабинет
              </Link>
            </div>
          )}

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Создание тендеров</h3>
              <p className="text-gray-600">
                Создавайте тендеры с детальным описанием ваших требований к грузоперевозке
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Смарт-контракты</h3>
              <p className="text-gray-600">
                Безопасные и прозрачные сделки с использованием технологии блокчейн
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Аналитика</h3>
              <p className="text-gray-600">
                Получайте рекомендации по оптимальной стоимости перевозки
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}