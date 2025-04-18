from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Any

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# Загрузка модели
try:
    model = joblib.load("/Users/aldiyarbolegenov/tender/ml/model/freight_price_predictor.pkl")
    # Получаем имена признаков из обученной модели
    feature_names = model.feature_names_in_
except Exception as e:
    raise RuntimeError(f"Failed to load model: {str(e)}")

@app.post("/predict")
async def predict(data: Dict[str, Any] = Body(...)):
    try:
        # Валидация входных данных
        required_fields = ['distance_km', 'weight_kg', 'cargo_type', 'urgency_days']
        for field in required_fields:
            if field not in data:
                raise HTTPException(
                    status_code=422,
                    detail=f"Missing required field: {field}"
                )

        # Преобразование cargo_type в one-hot encoding
        cargo_type = data['cargo_type']
        cargo_types = ["general", "fragile", "perishable"]
        if cargo_type not in cargo_types:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid cargo_type. Must be one of: {cargo_types}"
            )

        # Создаем словарь со всеми признаками
        features = {
            "distance_km": float(data['distance_km']),
            "weight_kg": float(data['weight_kg']),
            "urgency_days": float(data['urgency_days']),
            "cargo_type_perishable": 1 if cargo_type == "perishable" else 0,
            "cargo_type_fragile": 1 if cargo_type == "fragile" else 0,
            "cargo_type_general": 1 if cargo_type == "general" else 0
        }
        
        # Создаем DataFrame с правильным порядком признаков
        input_data = pd.DataFrame([features])[feature_names]
        
        # Предсказание
        price = model.predict(input_data)[0]
        return {"predicted_price": round(float(price), 2)}
    
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid input format: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))