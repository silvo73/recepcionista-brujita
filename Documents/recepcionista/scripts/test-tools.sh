#!/bin/bash

# Script para testear todos los endpoints
# Uso: bash scripts/test-tools.sh

HOST=${1:-http://localhost:3000}
SECRET=${TOOL_SECRET:-test-secret}

echo "🧪 Testeando endpoints de recepcionista-brujita en $HOST"
echo ""

# Test 1: Sin autenticación → 401
echo "❌ Test 1: Sin header x-brujita-key (debe ser 401)"
curl -s -X POST $HOST/tools/horario -H "Content-Type: application/json" -d '{}' | jq .
echo ""

# Test 2: Horario con autenticación
echo "✅ Test 2: GET /tools/horario"
curl -s -X POST $HOST/tools/horario \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{}' | jq .
echo ""

# Test 3: Info tienda
echo "✅ Test 3: GET /tools/info-tienda (dirección)"
curl -s -X POST $HOST/tools/info-tienda \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{"tema": "direccion"}' | jq .
echo ""

# Test 4: Buscar producto
echo "✅ Test 4: POST /tools/buscar-producto (iphone 13)"
curl -s -X POST $HOST/tools/buscar-producto \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{
    "consulta": "iPhone 13 128GB",
    "conversation_id": "test-conv-001"
  }' | jq .
echo ""

# Test 5: Tasación
echo "✅ Test 5: POST /tools/tasacion (iPhone 12)"
curl -s -X POST $HOST/tools/tasacion \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{
    "dispositivo": "iPhone 12",
    "estado": "funciona bien, pequeño arañazo",
    "conversation_id": "test-conv-002"
  }' | jq .
echo ""

# Test 6: Tasación desconocida
echo "✅ Test 6: POST /tools/tasacion (modelo desconocido)"
curl -s -X POST $HOST/tools/tasacion \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{
    "dispositivo": "Walkman Vintage 1987",
    "estado": "sin funcionar",
    "conversation_id": "test-conv-003"
  }' | jq .
echo ""

# Test 7: Dejar recado
echo "✅ Test 7: POST /tools/dejar-recado"
curl -s -X POST $HOST/tools/dejar-recado \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{
    "nombre": "María García",
    "telefono": "+34612345678",
    "motivo": "quiere vender un MacBook Air de 2019",
    "urgencia": "normal",
    "conversation_id": "test-conv-004"
  }' | jq .
echo ""

# Test 8: Dejar recado urgente
echo "✅ Test 8: POST /tools/dejar-recado (urgente)"
curl -s -X POST $HOST/tools/dejar-recado \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{
    "nombre": "Juan Pérez",
    "telefono": "+34687654321",
    "motivo": "problema con una compra anterior, cliente enfadado",
    "urgencia": "alta",
    "conversation_id": "test-conv-005"
  }' | jq .
echo ""

# Test 9: Health check
echo "✅ Test 9: GET /health"
curl -s $HOST/health | jq .
echo ""

# Test 10: Webhook (sin firma, solo structure)
echo "✅ Test 10: POST /webhooks/post-call (sin firma)"
curl -s -X POST $HOST/webhooks/post-call \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-webhook-001",
    "call_start_unix_timestamp": 1690000000,
    "call_duration_ms": 45000,
    "call_summary_gpt4": "Cliente preguntó por iPhone y dejó recado",
    "transcript": [
      {"role": "user", "content": "Hola, ¿tenéis iPhone?"},
      {"role": "assistant", "content": "Sí, tenemos varios modelos"}
    ],
    "language": "es",
    "credits_used": 5
  }' | jq .
echo ""

echo "✅ Tests completados"
