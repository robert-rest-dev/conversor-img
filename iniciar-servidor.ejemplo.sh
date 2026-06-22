#!/bin/bash
cd /ruta/completa/a/Conversor\ de\ imagenes
nohup node server.js > server.log 2>&1 &
disown
