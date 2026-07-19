import re
import json

text = '''K
405 paid
3 of 5 paid
popcorn
Total: 675
Bhuvaneswarran T    
270 left
Send reminder       
€135.00
€135.00
Unpaid
Ankit
A
Paid
€135.00
Vishnu Siddharth
€135.00
Paid
You
€135.00
Sent this request'''

lines = [l.strip() for l in text.split('\n') if l.strip()]
members = []
current_member = None

for line in lines:
    lower_line = line.lower()
    
    # 1. Total
    if lower_line.startswith('total:'):
        continue
        
    # 2. Check if amount
    amt_match = re.search(r'^(?:€|₹|rs\.?|inr|r)?\s*([\d,]+(?:\.\d{1,2})?)$', lower_line, re.IGNORECASE)
    if amt_match:
        if current_member and current_member.get('amount') is None:
            current_member['amount'] = float(amt_match.group(1).replace(',', ''))
        continue
        
    # 3. Check if status
    if lower_line in ['paid', 'unpaid', 'sent this request']:
        if current_member:
            current_member['paid'] = (lower_line == 'paid' or lower_line == 'sent this request')
        continue
        
    # 4. Check noise
    if len(line) <= 1 or ' paid' in lower_line or 'left' in lower_line or 'send reminder' in lower_line or lower_line in ['popcorn', 'split with', 'paid by', 'google pay']:
        continue
        
    # 5. Must be a name!
    if current_member:
        members.append(current_member)
    current_member = {'name': line, 'amount': None, 'paid': False}
    
if current_member:
    members.append(current_member)

print(json.dumps(members, indent=2))
