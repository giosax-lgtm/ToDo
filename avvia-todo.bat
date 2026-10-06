REM Avvio rapido su Windows (uso standalone, vedi SETUP.md parte A): installa le dipendenze se mancano (npm install),
REM costruisce l'app e la serve su http://localhost:4173 (script 'serve' di app/package.json), aprendo il browser.

@echo off
cd /d "%~dp0app"
if not exist node_modules call npm install
echo Costruisco e avvio toDo su http://localhost:4173 ...
start "" http://localhost:4173
call npm run serve
