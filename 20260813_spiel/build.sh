#!/bin/bash
# Build-Script: Concatenates all ES modules into a single bundle.js
# Uses Node.js to properly strip multi-line import/export statements

cd "$(dirname "$0")"

node build-bundle.js
