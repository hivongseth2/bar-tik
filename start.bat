@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TikTok Live Bar
echo ============================================
echo   TIKTOK LIVE BAR - ONG CHU MMO LIVE
echo ============================================
echo.

set "ROOT=%~dp0"
set "BRIDGE=%~dp0TikTokBridge"

rem ---------- 1. Node.js: uu tien ban di kem trong goi (runtime), khong co thi dung ban da cai ----------
set "NODE="
set "NPM="
if exist "%~dp0runtime\node.exe" set "NODE=%~dp0runtime\node.exe"
if exist "%~dp0runtime\npm.cmd" set "NPM=%~dp0runtime\npm.cmd"
if not defined NODE (
  where node >nul 2>nul && set "NODE=node"
)
if not defined NODE goto :noNode

set "NODEVER="
for /f "delims=" %%v in ('call "%NODE%" -p "process.versions.node" 2^>nul') do set "NODEVER=%%v"
if not defined NODEVER goto :noNode
for /f "tokens=1 delims=." %%m in ("%NODEVER%") do set "NODEMAJOR=%%m"
if %NODEMAJOR% LSS 20 (
  echo [LOI] Node.js %NODEVER% qua cu, can ban 20 tro len.
  echo       Tai ban LTS tai https://nodejs.org roi cai lai.
  goto :fail
)
echo [OK] Node.js %NODEVER%

if not exist "%BRIDGE%\package.json" (
  echo [LOI] Khong thay TikTokBridge\package.json canh start.bat.
  goto :fail
)
cd /d "%BRIDGE%"

rem ---------- 2. Thu vien (TikTokBridge\node_modules) ----------
"%NODE%" -e "for (const m of ['express','ws','three','tiktok-live-connector']) require.resolve(m)" >nul 2>nul
if not errorlevel 1 (
  echo [OK] Thu vien da du
  goto :config
)
echo [..] Thieu thu vien, dang cai bang npm ^(can mang Internet^)...
rem goi npm.cmd bang duong dan day du: goi "npm" trong ngoac kep thi npm.cmd tim nham thu muc (loi npm-cli.js)
if not defined NPM for /f "delims=" %%n in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%n"
if not defined NPM (
  echo [LOI] Khong tim thay npm de cai thu vien.
  echo       Cai Node.js ban LTS tai https://nodejs.org ^(co kem npm^) roi chay lai start.bat.
  goto :fail
)
if exist "package-lock.json" (
  call "%NPM%" ci --no-fund --no-audit
) else (
  call "%NPM%" install --no-fund --no-audit
)
if errorlevel 1 (
  echo [LOI] Cai thu vien that bai. Kiem tra mang Internet roi chay lai start.bat.
  goto :fail
)
echo [OK] Da cai thu vien

rem ---------- 3. Cau hinh: TikTokBridge\.env + cac file config\*.json ----------
:config
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [OK] Tao TikTokBridge\.env tu .env.example
  )
)
for %%f in (game gifts master observed-gifts) do (
  "%NODE%" -e "JSON.parse(require('fs').readFileSync('config/%%f.json','utf8'))" >nul 2>nul
  if errorlevel 1 (
    echo [LOI] TikTokBridge\config\%%f.json sai dinh dang JSON ^(thieu dau phay, ngoac...^). Loi cu the:
    "%NODE%" -e "try{JSON.parse(require('fs').readFileSync('config/%%f.json','utf8'))}catch(e){console.log('      '+e.message)}"
    goto :fail
  )
)
set "PORT_CFG="
for /f "delims=" %%p in ('call "%NODE%" -e "const e=require('./src/config/environment');e.loadEnvironmentFile();process.stdout.write(String(e.getServerSettings().port))"') do set "PORT_CFG=%%p"
if not defined PORT_CFG set "PORT_CFG=3000"
set "PROVIDER="
for /f "delims=" %%p in ('call "%NODE%" -e "require('./src/config/environment').loadEnvironmentFile();process.stdout.write(String(process.env.LIVE_PROVIDER||require('./config/game.json').liveProvider||'tiktok').toLowerCase())"') do set "PROVIDER=%%p"
set "TTUSER="
for /f "delims=" %%u in ('call "%NODE%" -e "require('./src/config/environment').loadEnvironmentFile();process.stdout.write(String(process.env.TIKTOK_USERNAME||'').replace(/^@/,''))"') do set "TTUSER=%%u"
if not "%~1"=="" set "TTUSER=%~1"
echo [OK] Cau hinh hop le, cong %PORT_CFG%, nguon live: %PROVIDER%
if "%PROVIDER%"=="tikfinity" echo      ^(Dang dung TikFinity: can mo TikFinity Desktop truoc. Noi thang TikTok: dat LIVE_PROVIDER=tiktok trong TikTokBridge\.env^)
if "%TTUSER%"=="" (
  echo [!!] Chua dien TIKTOK_USERNAME trong TikTokBridge\.env: nhap tai khoan o Bang dieu khien roi bam KET NOI.
) else (
  echo [OK] Tai khoan TikTok: @%TTUSER% ^(tu ket noi khi mo^)
)

rem ---------- 4. Cong da bi chiem chua (thuong la game dang mo o cua so khac) ----------
set "BUSYPID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT_CFG% .*LISTENING"') do set "BUSYPID=%%a"
if not defined BUSYPID goto :game
echo.
echo [!!] Cong %PORT_CFG% dang bi chuong trinh khac dung ^(PID %BUSYPID%^), co the game dang mo o cua so khac.
choice /c YN /m "Tat chuong trinh do de chay game"
if errorlevel 2 goto :fail
taskkill /pid %BUSYPID% /f >nul 2>nul
timeout /t 1 /nobreak >nul

rem ---------- 5. Game: ban web (mac dinh, dan link vao LIVE Studio) hoac ban Unity (GAME_MODE=unity trong .env) ----------
:game
set "GAME_MODE="
set "CONTROL_URL="
for /f "delims=" %%g in ('call "%NODE%" -e "require('./src/config/environment').loadEnvironmentFile();process.stdout.write(String(process.env.GAME_MODE||'web').toLowerCase())"') do set "GAME_MODE=%%g"
if not "%GAME_MODE%"=="unity" (
  echo [OK] Game ban web: dan link nay vao TikTok LIVE Studio ^(Add source - Link, 1080 x 1920^):
  echo      http://localtest.me:%PORT_CFG%/bar.html
  echo      ^(Muon chay ban Unity .exe: dat GAME_MODE=unity trong TikTokBridge\.env^)
  echo [OK] Mo quan bar kem Bang dieu khien ^(phim S an/hien^) tren trinh duyet.
  set "CONTROL_URL=http://127.0.0.1:%PORT_CFG%/bar.html?panel=1"
  goto :control
)
set "GAME_EXE="
if exist "%ROOT%Build\OngChuMMO_Live.exe" set "GAME_EXE=%ROOT%Build\OngChuMMO_Live.exe"
if not defined GAME_EXE if exist "%ROOT%Build\TIKTOK_LIVE_BAR.exe" set "GAME_EXE=%ROOT%Build\TIKTOK_LIVE_BAR.exe"
if not defined GAME_EXE (
  echo [!!] Chua co game trong thu muc Build: chi chay Bang dieu khien.
  echo      Tai ban Windows o muc Releases tren GitHub, hoac chay build.bat ^(can Unity 6^).
) else if not "%PORT_CFG%"=="3000" (
  echo [!!] Ban game dung san chi ket noi cong 3000, dang dung cong %PORT_CFG%: khong mo game.
  set "GAME_EXE="
) else (
  echo [OK] Game: %GAME_EXE%
  rem game tu ket noi lai Node, mo truoc cung duoc
  start "" "%GAME_EXE%"
)
:control
if not defined CONTROL_URL set "CONTROL_URL=http://127.0.0.1:%PORT_CFG%/control.html"
rem doi server len vai giay roi mo Bang dieu khien tren trinh duyet
start "" /min powershell -NoProfile -Command "Start-Sleep 3; Start-Process '%CONTROL_URL%'"

rem ---------- 6. Chay bridge ngay trong cua so nay ----------
echo.
echo --------------------------------------------
"%NODE%" server.js %TTUSER%
echo.
echo Game da dung.
pause
exit /b 0

:noNode
echo [LOI] Khong tim thay Node.js tren may.
where winget >nul 2>nul
if errorlevel 1 goto :noNodeManual
choice /c YN /m "Cai Node.js LTS tu dong bang winget"
if errorlevel 2 goto :noNodeManual
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo Cai xong: DONG cua so nay roi bam start.bat lai (de Windows nhan duong dan Node moi).
goto :fail
:noNodeManual
echo       Tai Node.js ban LTS tai https://nodejs.org , cai xong bam start.bat lai.
echo       Hoac dung goi zip tao bang dong-goi.bat, da kem san Node trong thu muc runtime.

:fail
echo.
pause
exit /b 1
