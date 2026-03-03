import requests
import json

url = "https://script.google.com/macros/s/AKfycbxmBBF0-oRREVy66H-mL6DGpdgY5fjgL8S1Nr13HBBVVfTbznemzSBWtnsYpPPbGbdb2A/exec"

payload = {
    "date": "2026-03-01",
    "month": "March 2026",
    "type": "Debit",
    "heading": "Msc",
    "description": "Test",
    "amount": 300,
    "account": "ICICI"
}

response = requests.post(url, json=payload)

print("Status Code:", response.status_code)
print("Response Body:", response.text)