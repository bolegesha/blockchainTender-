import Link from 'next/link';
import { useWeb3 } from '../hooks/useWeb3';
import NetworkSelector from './NetworkSelector';

export default function Navbar() {
  const { account, connectWallet, isConnecting } = useWeb3();

  return (
    <nav className="bg-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-800">
                TenderChain
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                href="/"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
              >
                Главная
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
              >
                Кабинет
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <NetworkSelector />
            {account ? (
              <div className="text-sm font-medium text-gray-900 bg-gray-100 rounded-full px-4 py-2">
                {account.substring(0, 6)}...{account.substring(account.length - 4)}
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
              >
                {isConnecting ? "Подключение..." : "Подключить кошелек"}
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}