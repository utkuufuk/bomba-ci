#!/bin/bash
source ./.env
echo $SERVER_PORT
netstat -tlnp | grep $SERVER_PORT