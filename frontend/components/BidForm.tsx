import { useState } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { ethers } from 'ethers';

export default function BidForm({ tenderId }: { tenderId: number }) {
  const [bid, setBid] = useState('');
  const [secret, setSecret] = useState('');
  const [isCommitPhase, setIsCommitPhase] = useState(true);
  const { contract } = useWeb3();

  const handleCommit = async () => {
    if (!contract) return;
    
    const bidHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes32'],
        [bid, ethers.utils.formatBytes32String(secret)]
      )
    );
    
    await contract.commitBid(tenderId, bidHash);
  };

  const handleReveal = async () => {
    if (!contract) return;
    await contract.revealBid(
      tenderId,
      bid,
      ethers.utils.formatBytes32String(secret)
    );
  };

  return (
    <div className="bid-form">
      <h3>Подать ставку</h3>
      
      {isCommitPhase ? (
        <>
          <input
            type="number"
            placeholder="Ваша ставка"
            value={bid}
            onChange={(e) => setBid(e.target.value)}
          />
          <input
            type="text"
            placeholder="Секретный ключ"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button onClick={handleCommit}>Подтвердить ставку</button>
        </>
      ) : (
        <>
          <p>Введите данные для раскрытия ставки</p>
          <button onClick={handleReveal}>Раскрыть ставку</button>
        </>
      )}
    </div>
  );
}