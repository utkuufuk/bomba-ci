#!/bin/bash
source ./.env

sudo kill -9 $(sudo lsof -t -i:$WEBHOOK_ENDPOINT_PORT -sTCP:LISTEN)