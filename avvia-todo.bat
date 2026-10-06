@echo off
cd /d "%~dp0app"
if not exist node_modules call npm install
echo Costruisco e avvio toDo su http://localhost:4173 ...
start "" http://localhost:4173
call npm run serve
