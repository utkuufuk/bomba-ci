#!/bin/bash
source ./.env
sudo kill -9 $(sudo lsof -t -i:$SERVER_PORT -sTCP:LISTEN)