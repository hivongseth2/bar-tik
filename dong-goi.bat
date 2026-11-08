@echo off
rem Dong goi chuong trinh de chuyen sang may khac: chep code + game Build + nhac/video + Node.js vao mot file zip.
rem Ket qua: thu muc "dong-goi" ben canh thu muc game, file TikTokLiveBar-NGAY.zip
cd /d %~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dong-goi.ps1"
pause
