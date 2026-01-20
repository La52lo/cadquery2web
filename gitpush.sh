#!/bin/bash

msg="$1"

if [ -z "$msg" ]; then
  msg="Auto commit on $(date)"
fi

git add .
git commit -m "$msg"
git pull --rebase
git push myfork main

echo "Pushed to GitHub! Message: $msg"
