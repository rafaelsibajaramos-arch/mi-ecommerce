@echo off
cd /d "C:\Users\rafae\Downloads\mi-ecommerce-breb-llaves-3117664491\mi-ecommerce"

echo Iniciando worker Bre-B / Llaves...
echo Fecha: %date% %time%

py scripts\bank-email-worker.py