@echo off
chcp 65001 >nul
echo.
echo === Publicar funções Mercado Pago no Supabase ===
echo Precisas de Node.js instalado. Na primeira vez corre: npx supabase login
echo Project ref: ahjhjzdmkkrcgbuxmhww (igual ao supabase-config.js)
echo.

cd /d "%~dp0.."

npx supabase functions deploy mercadopago-create-preference --project-ref ahjhjzdmkkrcgbuxmhww
if errorlevel 1 goto :err

npx supabase functions deploy mercadopago-webhook --project-ref ahjhjzdmkkrcgbuxmhww
if errorlevel 1 goto :err

echo.
echo OK — funções publicadas. Recarrega a app (Ctrl+F5) e testa o pagamento.
goto :eof

:err
echo.
echo Falhou. Confirma login (npx supabase login) e que estas na pasta certa do projeto.
pause
exit /b 1
