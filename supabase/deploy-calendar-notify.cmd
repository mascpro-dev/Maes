@echo off
chcp 65001 >nul
echo.
echo === Publicar notify-calendar-slot-change (e-mail Resend) ===
echo 1) No Supabase: Edge Functions - Secrets
echo    RESEND_API_KEY, CALENDAR_NOTIFY_TO (e-mails separados por virgula)
echo    Opcional: RESEND_FROM (remetente verificado na Resend)
echo 2) Na primeira vez: npx supabase login
echo.

cd /d "%~dp0.."

npx supabase functions deploy notify-calendar-slot-change --project-ref ahjhjzdmkkrcgbuxmhww --no-verify-jwt
if errorlevel 1 goto :err

echo.
echo OK — funcao publicada. Testa fechar um horario na agenda do medico.
goto :eof

:err
echo.
echo Falhou. Confirma login e project-ref (ou edita este .cmd).
pause
exit /b 1
