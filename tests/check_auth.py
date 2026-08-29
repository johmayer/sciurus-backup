import urllib.request
import urllib.error
import sys
import time

endpoints = [
    "/api/plans",
    "/api/sources",
    "/api/remotes",
    "/api/logs",
    "/api/sources/validate",
    "/api/remotes/validate"
]

BASE_URL = "http://127.0.0.1:3001"

print("Waiting for backend to start...")
for _ in range(30):
    try:
        urllib.request.urlopen(f"{BASE_URL}/api/health")
        break
    except urllib.error.URLError:
        time.sleep(1)
else:
    print("Backend failed to start")
    sys.exit(1)

print("Testing endpoints for Auth protection...")
failed = False
for endpoint in endpoints:
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url)
    try:
        resp = urllib.request.urlopen(req)
        print(f"FAIL: {endpoint} returned {resp.status} (expected 401)")
        failed = True
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print(f"PASS: {endpoint} is correctly protected (401 Unauthorized)")
        else:
            print(f"FAIL: {endpoint} returned {e.code} (expected 401)")
            failed = True

if failed:
    sys.exit(1)
else:
    print("All endpoints correctly protected.")
    sys.exit(0)
