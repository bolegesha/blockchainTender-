import { ethers } from 'ethers';

export const getTenderDetails = async (contract: any, tenderId: number) => {
  try {
    return await contract.tenders(tenderId);
  } catch (error) {
    console.error("Error fetching tender:", error);
    return null;
  }
};

export const getBidsForTender = async (contract: any, tenderId: number) => {
  // Здесь логика получения ставок
  // (может потребоваться The Graph для сложных запросов)
  return [];
};