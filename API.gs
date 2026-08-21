function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const type = payload.type || "transactions";
    const data = payload.data || payload; 
    const records = Array.isArray(data) ? data : [data];
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==========================================
    // 1. TRIGGER OCR FOR BALANCES
    // ==========================================
    if (type === "trigger_ocr") {
      const res = triggerOCR();
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ==========================================
    // 1.5 OCR A SPECIFIC SPLIT IMAGE FROM GDRIVE FOLDER
    // ==========================================
    else if (type === "ocr_split") {
      try {
        const FOLDER_ID = "1QdOpIOuHhzOEtXGhBhswtgiY0c-nKF5N"; // Folder ID
        const folder = DriveApp.getFolderById(FOLDER_ID);
        const files = folder.getFiles();
        
        let processed = false;
        let text = "";
        
        while (files.hasNext()) {
          const file = files.next();
          if (file.getMimeType().includes("image")) {
            const blob = file.getBlob();
            const resource = { title: file.getName() };
            
            const docFile = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: "en" });
            const doc = DocumentApp.openById(docFile.id);
            text = doc.getBody().getText();
            
            DriveApp.getFileById(docFile.id).setTrashed(true);
            file.setTrashed(true);
            processed = true;
            break; // Only process one split at a time
          }
        }
        
        if (!processed) {
           return ContentService.createTextOutput(JSON.stringify({status: "error", message: "No images found in the GDrive folder!"})).setMimeType(ContentService.MimeType.JSON);
        }
        
        return ContentService.createTextOutput(JSON.stringify({status: "success", text: text})).setMimeType(ContentService.MimeType.JSON);
      } catch (e) {
        return ContentService.createTextOutput(JSON.stringify({status: "error", message: e.toString()})).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ==========================================
    // 2. INSERT OR EDIT TRANSACTIONS
    // ==========================================
    else if (type === "transactions") {
      let errors = [];
      let inserted = 0;

      // ==========================================
      // OPTIMIZATION 1: Build a global ID cache ONCE instead of scanning every sheet per transaction.
      // Old code: For each tx, loop ALL sheets and read column J → O(txns × sheets × rows)
      // New code: Read column J of each sheet ONCE upfront → O(sheets × rows), then O(1) lookups.
      // ==========================================
      // Normalize IDs to match the old loose-equality (==) behavior
      const normalizeId = (val) => String(val).trim();
      
      const idCache = {}; // { normalized_id: { sheet, row } }
      const allSheets = ss.getSheets();
      for (const s of allSheets) {
        const sLastUsed = s.getLastRow();
        if (sLastUsed >= 2 && s.getMaxColumns() >= 10) {
          const idValues = s.getRange(2, 10, sLastUsed - 1, 1).getValues();
          for (let i = 0; i < idValues.length; i++) {
            if (idValues[i][0] !== "" && idValues[i][0] !== null && idValues[i][0] !== undefined) {
              idCache[normalizeId(idValues[i][0])] = { sheet: s, row: i + 2 };
            }
          }
        }
      }

      // ==========================================
      // OPTIMIZATION 2: Group transactions by target sheet so we read each sheet's dates ONCE.
      // ==========================================
      const txBySheet = {}; // { sheetName: [{ tx, sheetName, txDate, formattedType, id, createdAt }] }
      
      records.forEach(tx => {
        const { date, month, type: rawType, heading, description, amount, account } = tx;
        const id = tx.id || Utilities.getUuid();
        
        let sheetName = account;
        if (account === "Cash") sheetName = "IDBI";
        else if (account && account.startsWith("CC")) sheetName = "CreditCard";

        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) { errors.push(sheetName); return; }

        const txDate = new Date(date);
        txDate.setHours(0, 0, 0, 0);
        const formattedType = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase() : "";

        // Handle EDIT (ID already exists in some sheet)
        const cached = idCache[normalizeId(id)];
        if (cached) {
          const foundSheet = cached.sheet;
          const existingRow = cached.row;
          const existingDateRaw = foundSheet.getRange(existingRow, 1).getValue();
          let existingDate = new Date(existingDateRaw);
          existingDate.setHours(0, 0, 0, 0);

          if (foundSheet.getName() === sheetName && existingDate.getTime() === txDate.getTime()) {
            // Update in place — no need to insert
            foundSheet.getRange(existingRow, 1, 1, 6).setValues([[new Date(date), month, formattedType, heading, description, amount]]);
            foundSheet.getRange(existingRow, (sheetName === "IDBI" || sheetName === "CreditCard") ? 9 : 8).setValue(account);
            inserted++;
            return; 
          } else {
            // Date or sheet changed. Delete old row.
            foundSheet.deleteRow(existingRow);
            if (existingRow > 2 && existingRow <= foundSheet.getLastRow()) {
              const fName = foundSheet.getName();
              if (fName === "IDBI" || fName === "CreditCard") foundSheet.getRange(existingRow - 1, 7, 1, 2).copyTo(foundSheet.getRange(existingRow, 7, 1, 2));
              else foundSheet.getRange(existingRow - 1, 7).copyTo(foundSheet.getRange(existingRow, 7));
            }
            // Fall through to insert
          }
        }

        // Queue for batch insert
        if (!txBySheet[sheetName]) txBySheet[sheetName] = [];
        txBySheet[sheetName].push({ date, month, formattedType, heading, description, amount, account, txDate, id, createdAt: new Date() });
      });

      // ==========================================
      // BATCH INSERT: Process each sheet's queued transactions together.
      // Read the sheet's date column ONCE, then insert all transactions.
      // ==========================================
      for (const sheetName in txBySheet) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) continue;

        // Sort new transactions by date so insertions don't shift each other's positions
        const txList = txBySheet[sheetName].sort((a, b) => a.txDate - b.txDate);

        for (const tx of txList) {
          const lastUsed = sheet.getLastRow();
          const colA = sheet.getRange(1, 1, lastUsed || 1).getValues();
          let lastDataRow = 0;
          for (let i = colA.length - 1; i >= 0; i--) {
            if (colA[i][0] !== "") { lastDataRow = i + 1; break; }
          }

          let insertRow = lastDataRow + 1;
          if (lastDataRow >= 2) {
            const dateValues = sheet.getRange(2, 1, lastDataRow - 1, 1).getValues();
            for (let i = 0; i < dateValues.length; i++) {
              if (!dateValues[i][0]) continue;
              const cellDate = new Date(dateValues[i][0]);
              cellDate.setHours(0, 0, 0, 0);
              if (cellDate > tx.txDate) { insertRow = i + 2; break; }
            }
          }

          sheet.insertRowBefore(insertRow);
          sheet.getRange(insertRow, 1, 1, 6).setValues([[new Date(tx.date), tx.month, tx.formattedType, tx.heading, tx.description, tx.amount]]);
          const sourceRow = (insertRow > 2) ? insertRow - 1 : (lastDataRow >= 2 ? insertRow + 1 : 0);

          if (sourceRow > 0) {
            sheet.getRange(sourceRow, 1, 1, 6).copyTo(sheet.getRange(insertRow, 1, 1, 6), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
          }

          if (sheetName === "IDBI" || sheetName === "CreditCard") {
            if (sourceRow > 0) {
              sheet.getRange(sourceRow, 7, 1, 2).copyTo(sheet.getRange(insertRow, 7, 1, 2));
              if (insertRow <= sheet.getLastRow()) sheet.getRange(insertRow, 7, 1, 2).copyTo(sheet.getRange(insertRow + 1, 7, 1, 2));
            }
            sheet.getRange(insertRow, 9).setValue(tx.account);
          } else {
            if (sourceRow > 0) {
              sheet.getRange(sourceRow, 7).copyTo(sheet.getRange(insertRow, 7));
              if (insertRow <= sheet.getLastRow()) sheet.getRange(insertRow, 7).copyTo(sheet.getRange(insertRow + 1, 7));
            }
            sheet.getRange(insertRow, 8).setValue(tx.account);
          }

          sheet.getRange(insertRow, 10, 1, 2).setValues([[tx.id, tx.createdAt]]);
          inserted++;
        }
      }

      SpreadsheetApp.flush(); // Flush once at the end

      const msg = errors.length > 0 ? `${inserted} inserted. Skipped missing: ${[...new Set(errors)].join(", ")}` : `${inserted} transactions processed`;
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: msg})).setMimeType(ContentService.MimeType.JSON);
    } 
    
    // ==========================================
    // 2. SINGLE DELETE
    // ==========================================
    else if (type === "delete_transaction") {
      const { id, account } = data;
      let sheetName = account;
      if (account === "Cash") sheetName = "IDBI";
      else if (account && account.startsWith("CC")) sheetName = "CreditCard";

      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Sheet not found"})).setMimeType(ContentService.MimeType.JSON);

      const lastUsed = sheet.getLastRow();
      if (lastUsed < 2) return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);

      const idValues = sheet.getRange(2, 10, lastUsed - 1, 1).getValues(); 
      let rowIndex = -1;
      
      for (let i = 0; i < idValues.length; i++) {
        if (idValues[i][0] == id) { rowIndex = i + 2; break; }
      }

      if (rowIndex !== -1) {
        sheet.deleteRow(rowIndex);
        if (rowIndex > 2 && rowIndex <= sheet.getLastRow()) {
          if (sheetName === "IDBI" || sheetName === "CreditCard") sheet.getRange(rowIndex - 1, 7, 1, 2).copyTo(sheet.getRange(rowIndex, 7, 1, 2));
          else sheet.getRange(rowIndex - 1, 7).copyTo(sheet.getRange(rowIndex, 7));
        }
        SpreadsheetApp.flush();
      }
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Transaction deleted"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 3.5 BACKFILL MISSING IDs (ONE-TIME USE)
    // ==========================================
    else if (type === "backfill_ids") {
      let matchedCount = 0;
      const dbTxList = records; // array of all txs from DB
      const dbMap = {}; // Map by SheetName -> Signature -> ID

      // 1. Group the incoming DB transactions by sheet and create a unique signature
      dbTxList.forEach(tx => {
        let sheetName = tx.account;
        if (sheetName === "Cash") sheetName = "IDBI";
        else if (sheetName && sheetName.startsWith("CC")) sheetName = "CreditCard";

        if (!dbMap[sheetName]) dbMap[sheetName] = [];
        
        // Signature: YYYY-MM-DD_Amount_Heading (ensures exact match)
        const txDate = new Date(tx.date);
        const sig = `${txDate.getFullYear()}-${txDate.getMonth()+1}-${txDate.getDate()}_${tx.amount}_${tx.heading}`.toLowerCase();
        
        dbMap[sheetName].push({ sig: sig, id: tx.id, date: tx.date, used: false });
      });

      // 2. Loop through the sheets to find empty ID cells
      for (const sheetName in dbMap) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) continue;

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) continue;

        // Read Columns A through K (1 to 11)
        const range = sheet.getRange(2, 1, lastRow - 1, 11);
        const values = range.getValues();
        let updated = false;

        for (let i = 0; i < values.length; i++) {
          const rawDate = values[i][0]; // Col A
          const rowHeading = String(values[i][3] || "").trim(); // Col D
          const rowAmount = values[i][5]; // Col F
          const rowId = values[i][9]; // Col J (index 9)

          // If ID is missing, try to find its match in the DB data
          if (!rowId && rawDate && rowHeading && rowAmount !== "") {
             const rowDate = new Date(rawDate);
             if (!isNaN(rowDate.getTime())) {
                const targetSig = `${rowDate.getFullYear()}-${rowDate.getMonth()+1}-${rowDate.getDate()}_${rowAmount}_${rowHeading}`.toLowerCase();

                // Find a match that hasn't been claimed yet
                const matches = dbMap[sheetName].filter(item => item.sig === targetSig && !item.used);
                if (matches.length > 0) {
                  const match = matches[0];
                  match.used = true; // Claim this match so duplicates don't overlap
                  values[i][9] = match.id.toString(); // Write ID
                  values[i][10] = new Date(match.date); // Write Date of insertion
                  updated = true;
                  matchedCount++;
                }
             }
          }
        }

        // 3. Write ONLY Columns J and K back to the sheet to protect your other data
        if (updated) {
          const idAndCreated = values.map(row => [row[9], row[10]]);
          sheet.getRange(2, 10, idAndCreated.length, 2).setValues(idAndCreated);
        }
      }
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: `Backfilled ${matchedCount} missing IDs!`})).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 3. BULK DELETE
    // ==========================================
    else if (type === "bulk_delete_transactions") {
      let deletedCount = 0;
      const sheetDeletes = {};
      
      records.forEach(item => {
        let sName = item.account;
        if (sName === "Cash") sName = "IDBI";
        else if (sName && sName.startsWith("CC")) sName = "CreditCard";
        if (!sheetDeletes[sName]) sheetDeletes[sName] = [];
        sheetDeletes[sName].push(item.id.toString());
      });

      for (const sheetName in sheetDeletes) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) continue;

        const idsToDelete = sheetDeletes[sheetName];
        const lastUsed = sheet.getLastRow();
        if (lastUsed < 2) continue;

        const idValues = sheet.getRange(2, 10, lastUsed - 1, 1).getValues();
        let rowsToDelete = [];
        
        for (let i = 0; i < idValues.length; i++) {
          if (idsToDelete.includes(idValues[i][0].toString())) rowsToDelete.push(i + 2);
        }

        // Delete from bottom to top so indices don't shift
        rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => {
          sheet.deleteRow(rowIndex);
          if (rowIndex > 2 && rowIndex <= sheet.getLastRow()) {
            if (sheetName === "IDBI" || sheetName === "CreditCard") sheet.getRange(rowIndex - 1, 7, 1, 2).copyTo(sheet.getRange(rowIndex, 7, 1, 2));
            else sheet.getRange(rowIndex - 1, 7).copyTo(sheet.getRange(rowIndex, 7));
          }
          deletedCount++;
        });
      }
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: `${deletedCount} transactions bulk deleted cleanly`})).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 4. INVESTMENTS LOGIC (Stocks + MF + Total)
    // ==========================================
    else if (type === "investments") {
      const sheet = ss.getSheetByName("INVES-T-RACKER");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Sheet INVES-T-RACKER not found"})).setMimeType(ContentService.MimeType.JSON);

      let inserted = 0;
      records.forEach(inv => {
        const snapshotDate = new Date(inv.date);
        const snapshotStr = Utilities.formatDate(snapshotDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return;

        // Check if date already exists to prevent duplicates
        const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        const exists = dates.some(d => {
          if (!d[0]) return false;
          const cellStr = (d[0] instanceof Date) ? Utilities.formatDate(d[0], Session.getScriptTimeZone(), "dd/MM/yyyy") : d[0].toString();
          return cellStr === snapshotStr || d[0] === inv.date;
        });
        if (exists) return; 
  
        // Insert new row
        sheet.insertRowAfter(lastRow);
        const newRow = lastRow + 1;
        
        // Write all 13 columns directly from the Python backend!
        sheet.getRange(newRow, 1, 1, 13).setValues([[
          snapshotDate,          // A: Date
          inv.inv_stocks,        // B: INV (Stocks)
          inv.curr_stocks,       // C: CURR (Stocks)
          inv.ret_pct_stocks,    // D: RET (Stocks)
          inv.status_stocks,     // E: Stocks Status
          inv.inv_mf,            // F: INV (MF)
          inv.curr_mf,           // G: CURR (MF)
          inv.ret_pct_mf,        // H: RET (MF)
          inv.status_mf,         // I: MF Status
          inv.total_inv,         // J: Total INV
          inv.total_curr,        // K: Total CURR
          inv.total_ret_pct,     // L: Total RET
          inv.total_status       // M: Total Status
        ]]);
        
        // Ensure date is formatted cleanly
        sheet.getRange(newRow, 1).setNumberFormat("dd/MM/yyyy");
        
        inserted++;
      });
      
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: `${inserted} investments synced`})).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {

    if (e.parameter.type === "transactions") {
      return getTransactions();
    }

    // Default → balances
    return getBalances();

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getBalances() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("OVERALL");

  const range = sheet.getRange("B4:C10").getValues();

  const result = {};

  range.forEach(row => {
    let name = row[0];
    let value = row[1];

    if (!name) return;

    name = name.replace(/[^\w\s]/g, "").trim();

    if (typeof value === "string") {
      value = Number(value.replace(/,/g, ""));
    }

    result[name] = value;
  });

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getTransactions() {

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("COMPLETE");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService
      .createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

  let allTransactions = [];

  data.forEach((row, index) => {

  allTransactions.push({
    id: index + 2,
    date: Utilities.formatDate(
      row[0],
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    ),
    month: Utilities.formatDate(
      row[0],
      Session.getScriptTimeZone(),
      "yyyy-MM-01"
    ),
    type: row[2],
    heading: row[3],
    description: row[4],
    amount: row[5],
    account: row[6]
  });

});

  return ContentService
    .createTextOutput(JSON.stringify(allTransactions))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// REAL BALANCE OCR ENGINE
// ==========================================
function triggerOCR() {
  const FOLDER_ID = "1QdOpIOuHhzOEtXGhBhswtgiY0c-nKF5N"; // Your folder ID
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();

  let allText = "";
  let processed = 0;

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType().includes("image")) {
      const blob = file.getBlob();
      const resource = { title: file.getName() };
      
      // Requires Advanced Drive API Service!
      const docFile = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: "en" });
      const doc = DocumentApp.openById(docFile.id);
      allText += doc.getBody().getText() + "\n";

      DriveApp.getFileById(docFile.id).setTrashed(true);
      file.setTrashed(true);
      processed++;
    }
  }

  if (processed === 0) {
    return { status: "no_images", message: "⚠️ No screenshots found in folder." };
  }

  const parsedData = extractAndAppendBalances(allText);
  return { status: "success", data: parsedData };
}

function extractAndAppendBalances(text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let helper = ss.getSheetByName("BALANCES");
  if (!helper) helper = ss.insertSheet("BALANCES");

  const today = new Date();

  // OCR cleanup
  text = text.replace(/\*/g, "₹");
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);

  // Banks in screen order
  const banks = [
    { key: "IDBI", regex: /idbi/i },
    { key: "INDIAN", regex: /indian/i },
    { key: "FEDERAL", regex: /federal/i },
    { key: "ICICI", regex: /icici/i },
    { key: "CUB", regex: /city/i },
    { key: "KOTAK", regex: /kotak/i }
  ];

  const detectedBanks = [];
  for (const line of lines) {
    for (const bank of banks) {
      if (bank.regex.test(line)) {
        detectedBanks.push(bank.key);
        break;
      }
    }
  }

  const detectedAmounts = [];
  for (const line of lines) {
    const amtMatch = line.match(/([0-9,]+\.[0-9]+)/);
    if (amtMatch) {
      detectedAmounts.push(Math.round(parseFloat(amtMatch[1].replace(/,/g, ""))));
    }
  }

  // Map sequentially
  const result = {};
  for (let i = 0; i < detectedBanks.length; i++) {
    result[detectedBanks[i]] = detectedAmounts[i] || "";
  }

  // Write row
  helper.appendRow([
    today,
    result["KOTAK"] || "",
    result["IDBI"] || "",
    result["FEDERAL"] || "",
    result["CUB"] || "",
    result["INDIAN"] || "",
    result["ICICI"] || ""
  ]);

  return result;
}

function jsonResponse(status, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ status, message }))
    .setMimeType(ContentService.MimeType.JSON);
}