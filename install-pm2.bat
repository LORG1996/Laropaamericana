@echo off
cd /d "E:\soft\My Plugins\Laropaamericana"
echo Installing PM2 globally...
npm install -g pm2
echo.
echo Starting with PM2 (background process)...
pm2 start server.js --name "ropa-americana"
pm2 save
echo.
echo Done! Server runs in background.
echo Commands:
echo   pm2 logs ropa-americana   - view logs
echo   pm2 stop ropa-americana   - stop
echo   pm2 restart ropa-americana - restart
echo   pm2 monit                 - dashboard
pause