@echo off
REM vacAI Weekly Search Runner
REM Update the dates below when planning a new trip window.

set ROOT=C:\Users\ceojo\Documents\Projects\vacAI
set ORIGIN=ABQ
set DESTINATION=Orlando, FL
set DEPART=2026-07-10
set RETURN=2026-07-17
set TRAVELERS=4

echo [%DATE% %TIME%] Starting vacAI weekly searches...

echo Running flights search...
node "%ROOT%\playwright\search.js" flights --origin "%ORIGIN%" --destination "%DESTINATION%" --depart %DEPART% --return %RETURN% --travelers %TRAVELERS% >> "%ROOT%\playwright\logs\flights.log" 2>&1

REM Wait 60 seconds between searches to avoid simultaneous browser launches
timeout /t 60 /nobreak > nul

echo Running hotels search...
node "%ROOT%\playwright\search.js" hotels --destination "%DESTINATION%" --depart %DEPART% --return %RETURN% --travelers %TRAVELERS% >> "%ROOT%\playwright\logs\hotels.log" 2>&1

timeout /t 60 /nobreak > nul

echo Running vacation packages search...
node "%ROOT%\playwright\search.js" vacation-packages --origin "%ORIGIN%" --destination "%DESTINATION%" --depart %DEPART% --return %RETURN% --travelers %TRAVELERS% >> "%ROOT%\playwright\logs\vacation-packages.log" 2>&1

echo [%DATE% %TIME%] All searches complete.
