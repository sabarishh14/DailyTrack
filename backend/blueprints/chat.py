from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta, timezone
import os
import re
import json
import pytz
import requests
from extensions import (
    db, require_api_key, require_admin,
    SHEETS_URL, JWT_SECRET, ALLOWED_EMAILS, ADMIN_USER, ADMIN_PASS,
    KITE_API_KEY, KITE_API_SECRET, TMDB_API_KEY,
)
from models import *

import google.generativeai as genai
from sqlalchemy import text

chat_bp = Blueprint("chat", __name__)

@chat_bp.route('/api/chat', methods=['POST'])
@require_api_key
def handle_chat_query():
    data = request.json
    user_query = data.get('query')
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"success": False, "message": "Nagapandi is sleeping (API key missing)."})
        
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-3.5-flash-lite')
    
    prompt = f'''
    You are 'Nagapandi', a highly capable AI assistant for a personal tracking app (LifeTrack). 
    Your goal is to answer the user's question by generating a PostgreSQL query.
    
    Database Schema:
    - transactions(id, account, date, type, heading, description, amount, exclude_analytics)
    - movie_diary_logs(id, movie_id, date, rating, review, liked, tags, created_at, rewatch)
    - movies(id, tmdb_id, name, poster_path, status, added_on, runtime, release_year)
    - physical_activity(id, date, gym, badminton, table_tennis, cricket, others, description)
    
    IMPORTANT RULES & DOMAIN KNOWLEDGE FOR TRANSACTIONS:
    1. "Spent", "Expense", "Cost", "Paid" means `type = 'Debit'`. "Income" or "Earned" means `type = 'Credit'`.
    2. "Credit Card" means `account ILIKE 'CC-%'`. (e.g. 'CC-AXIS REWARDS', 'CC-PINNACLE 6360').
    3. Today's date is {date.today()}. Use this for resolving "this month" or "this year" (e.g., `extract(month from date) = {date.today().month}`).
    4. If asked about a specific bank (like "Federal", "IDBI", "ICICI"), use `account ILIKE '%bankname%'`.
    5. Categories or High-level groupings are stored in `heading` (e.g., 'Food', 'Snacks', 'Daily Need', 'Transport', 'Cinema', 'Medical').
    6. Specific Merchants, items, or details are stored in `description` (e.g., 'California Burrito', 'Amazon', 'Electricity').
    7. To search for a specific merchant or item (like "california burrito" or "haircut"), use `description ILIKE '%merchant%' OR heading ILIKE '%merchant%'`.
    8. If asked "how much" or "total", return a SUM (`SELECT SUM(amount)`). If asked "how many times", return a COUNT (`SELECT COUNT(*)`). If asked "when was the last", return a MAX date (`SELECT MAX(date)`).
    
    User Query: "{user_query}"
    
    Write a SQL query to fetch the exact data needed to answer the user's question. 
    It MUST start with SELECT and be completely read-only.
    Return ONLY a JSON object exactly like this (without markdown tags):
    {{"sql": "SELECT SUM(amount) FROM transactions WHERE type = 'Debit' AND description ILIKE '%california burrito%' "}}
    '''
    
    try:
        response = model.generate_content(prompt)
        resp_text = response.text.strip()
        if resp_text.startswith('```json'): resp_text = resp_text[7:]
        if resp_text.startswith('```'): resp_text = resp_text[3:]
        if resp_text.endswith('```'): resp_text = resp_text[:-3]
        
        parsed = json.loads(resp_text.strip())
        sql_query = parsed.get("sql")
        
        if not sql_query or not sql_query.strip().upper().startswith("SELECT"):
            return jsonify({"success": False, "message": "Nagapandi can only run read-only queries."})
            
        result_proxy = db.session.execute(text(sql_query))
        rows = result_proxy.fetchall()
        db_result = str([dict(row._mapping) for row in rows])[:2000] # Cap size
        
        prompt2 = f'''
        You are 'Nagapandi', a highly capable AI assistant for LifeTrack. 
        User asked: "{user_query}"
        The database returned: {db_result}
        
        Formulate a very fast, conversational, and direct answer based ONLY on the database result. 
        Keep it brief, smooth, and friendly. Use emojis where appropriate. Do NOT mention "the database returned". 
        '''
        final_response = model.generate_content(prompt2)
        
        return jsonify({"success": True, "result": final_response.text.strip()})
        
    except Exception as e:
        print("Nagapandi Error:", e)
        return jsonify({"success": False, "message": f"Nagapandi encountered an error: {str(e)}"})


