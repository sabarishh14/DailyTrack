import requests
import json

# 🔁 Replace with your deployed Web App URL
url = "https://script.google.com/macros/s/AKfycbxmBBF0-oRREVy66H-mL6DGpdgY5fjgL8S1Nr13HBBVVfTbznemzSBWtnsYpPPbGbdb2A/exec"

try:
    response = requests.get(url)

    print("Status Code:", response.status_code)
    print()

    if response.status_code == 200:
        data = response.json()

        print("Balances:")
        print("---------")
        for key, value in data.items():
            print(f"{key}: {value:,}")
    else:
        print("Error Response:")
        print(response.text)

except Exception as e:
    print("Request Failed:", str(e))