#!/bin/sh
# Arc 1 host: streams this Mac's whole screen to the Arc 1 viewer. Viewer link is printed (room code also in A1/Room.txt).
cd "$(dirname "$0")"
[ -x A1/Capture ] || swiftc -O -o A1/Capture A1/Capture.swift
node A1/Engine.js 2>&1 | tee A1/Host.log
