import requests
import json
from datetime import datetime

SHEETS_URL = "https://script.google.com/macros/s/AKfycbxmBBF0-oRREVy66H-mL6DGpdgY5fjgL8S1Nr13HBBVVfTbznemzSBWtnsYpPPbGbdb2A/exec"


def get_balances():
    print("\nFetching balances...\n")
    try:
        res = requests.get(SHEETS_URL, timeout=15)
        print(json.dumps(res.json(), indent=2))
    except Exception as e:
        print("Error:", e)


def get_transactions():
    print("\nFetching transactions...\n")
    try:
        res = requests.get(
            SHEETS_URL,
            params={"type": "transactions"},
            timeout=30
        )
        data = res.json()

        print(f"\nTotal Transactions: {len(data)}\n")

        for tx in data[:5]:  # show first 5 only
            print(json.dumps(tx, indent=2))
            print("-" * 40)

    except Exception as e:
        print("Error:", e)


def add_transaction():
    print("\nAdd Test Transaction\n")

    account = input("Account (e.g., IDBI): ")
    amount = float(input("Amount: "))
    txn_type = input("Type (credit/debit): ").capitalize()
    heading = input("Heading: ")

    today = datetime.now()

    payload = {
        "date": today.strftime("%Y-%m-%d"),
        "month": today.strftime("%B %Y"),
        "type": txn_type,
        "heading": heading,
        "description": "API Test Entry",
        "amount": amount,
        "account": account
    }

    try:
        res = requests.post(SHEETS_URL, json=payload, timeout=15)
        print("\nResponse:")
        print(res.json())
    except Exception as e:
        print("Error:", e)


def sync_test():
    print("\nRunning Full Sync Test...\n")
    try:
        res = requests.get(
            SHEETS_URL,
            params={"type": "transactions"},
            timeout=30
        )

        data = res.json()

        ids = set()
        duplicates = 0

        for tx in data:
            if tx["id"] in ids:
                duplicates += 1
            ids.add(tx["id"])

        print(f"Total transactions: {len(data)}")
        print(f"Duplicate IDs found: {duplicates}")

        if duplicates == 0:
            print("✅ No duplicate IDs. Sync safe.")
        else:
            print("❌ Duplicate IDs detected!")

    except Exception as e:
        print("Error:", e)


def menu():
    while True:
        print("\n===== GOOGLE SHEETS API TEST MENU =====")
        print("1. Get Balances")
        print("2. Get Transactions")
        print("3. Add Test Transaction")
        print("4. Sync Integrity Test")
        print("5. Exit")

        choice = input("\nEnter choice: ")

        if choice == "1":
            get_balances()
        elif choice == "2":
            get_transactions()
        elif choice == "3":
            add_transaction()
        elif choice == "4":
            sync_test()
        elif choice == "5":
            print("Exiting...")
            break
        else:
            print("Invalid choice")


if __name__ == "__main__":
    menu()