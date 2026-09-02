import os
import urllib.request
import zipfile
import sys

dest_dir = r"C:\Users\Tamil\AppData\Local\Programs\node"
zip_path = os.path.join(os.environ.get("TEMP", r"C:\TEMP"), "node_v20.zip")

print("Downloading Node.js v20.18.0...")
url = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
urllib.request.urlretrieve(url, zip_path)
print(f"Downloaded zip: {os.path.getsize(zip_path)} bytes")

print("Extracting...")
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    for member in zip_ref.namelist():
        # Strip top-level directory
        parts = member.split('/', 1)
        if len(parts) > 1 and parts[1]:
            target_path = os.path.join(dest_dir, parts[1].replace('/', os.sep))
            if member.endswith('/'):
                os.makedirs(target_path, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with zip_ref.open(member) as source, open(target_path, 'wb') as target:
                    target.write(source.read())

print("Node extracted successfully!")
node_exe = os.path.join(dest_dir, "node.exe")
if os.path.exists(node_exe):
    print("Node.exe exists at:", node_exe)
else:
    print("Node.exe not found")
