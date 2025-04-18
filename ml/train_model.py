import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib

# Генерация реалистичных mock-данных
np.random.seed(42)
n_samples = 1000

data = {
    "distance_km": np.random.randint(50, 2000, n_samples),
    "weight_kg": np.random.randint(100, 10000, n_samples),
    "cargo_type": np.random.choice(["general", "fragile", "perishable"], n_samples),
    "urgency_days": np.random.randint(1, 30, n_samples)
}

# Реалистичная формула цены
data["price_usd"] = (
    50 
    + data["distance_km"] * 0.5 
    + data["weight_kg"] * 0.1 
    + (30 - data["urgency_days"]) * 10 
    * np.where(data["cargo_type"] == "fragile", 1.3, 
              np.where(data["cargo_type"] == "perishable", 1.5, 1))
)

df = pd.DataFrame(data)
df.to_csv("data/mock_freight_data.csv", index=False) 

# Преобразование категориальных признаков
df = pd.get_dummies(df, columns=["cargo_type"])

# Обучение модели
X = df.drop("price_usd", axis=1)
y = df["price_usd"]
model = RandomForestRegressor(n_estimators=100)
model.fit(X, y)

# Сохранение модели
joblib.dump(model, "model/freight_price_predictor.pkl")
print("Model trained and saved!")