import { useState } from 'react';

interface PricePredictorProps {
  distance: string;
  weight: string;
  cargoType: string;
  urgencyDays: string;
}

export default function PricePredictor({ 
  distance, 
  weight, 
  cargoType,
  urgencyDays
}: PricePredictorProps) {
  const [prediction, setPrediction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePredict = async () => {
    if (!distance || !weight) {
      setError('Пожалуйста, укажите расстояние и вес');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_km: parseFloat(distance),
          weight_kg: parseFloat(weight),
          cargo_type: cargoType,
          urgency_days: parseFloat(urgencyDays)
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка при получении прогноза');
      }

      const data = await response.json();
      setPrediction(data.predicted_price.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      console.error("Prediction error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="predictor-container">
      <h3>Предсказание цены</h3>
      <button 
        onClick={handlePredict} 
        disabled={loading}
        className="predict-button"
      >
        {loading ? 'Загрузка...' : 'Рассчитать цену'}
      </button>
      
      {error && (
        <div className="error-message">{error}</div>
      )}

      {prediction && !error && (
        <div className="prediction-result">
          <strong>Предсказанная цена:</strong> ${prediction}
        </div>
      )}
    </div>
  );
}