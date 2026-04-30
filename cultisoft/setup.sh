#!/usr/bin/env bash
set -e

echo ""
echo "================================================"
echo "  CultiSoft - Setup local"
echo "================================================"
echo ""

echo "[1/3] Instalando dependencias..."
npm install

echo ""
echo "[2/3] Creando base de datos SQLite..."
npm run db:init

echo ""
echo "[3/3] Cargando datos reales desde CSVs..."
npm run db:seed

echo ""
echo "================================================"
echo "  Setup completo"
echo "================================================"
echo "  Inicia el servidor con:   npm run dev"
echo "  Luego abre:               http://localhost:3030"
echo "  Login:                    admin@cultimed.cl / admin123"
echo "================================================"
