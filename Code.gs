/**
 * Super Mario Arcade - Google Sheets Cloud Leaderboard Webhook
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet (e.g. name it "Mario Arcade Leaderboard").
 * 2. In Google Sheets, click: Extensions > Apps Script.
 * 3. Delete any default code in Code.gs and paste this entire script.
 * 4. In Apps Script, click: Project Settings (gear icon on left).
 * 5. Under "Script Properties", click "Add script property":
 *    - Property: MARIO_SHEETS_TOKEN
 *    - Value: Choose any random password/token (e.g. "mario_secret_token_123")
 * 6. Click "Save script properties".
 * 7. Click "Deploy" > "New deployment".
 *    - Select type: "Web app" (click the gear icon next to "Select type").
 *    - Description: "Mario Leaderboard API"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (allows the game client to submit scores)
 * 8. Click "Deploy", authorize permissions when prompted, and copy the Web App URL:
 *    https://script.google.com/macros/s/.../exec
 * 9. Paste the Web App URL and Token into your Mario Arcade game settings!
 */

function setupSheetIfNeeded(sheet) {
  if (sheet.getLastRow() === 0) {
    var headers = [
      "Timestamp",
      "Player Name",
      "Score",
      "Coins",
      "World",
      "Photo Avatar"
    ];
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#181c22");
    headerRange.setFontColor("#fcd844");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    sheet.setRowHeight(1, 35);
    sheet.setColumnWidth(1, 180); // Timestamp
    sheet.setColumnWidth(2, 140); // Player Name
    sheet.setColumnWidth(3, 100); // Score
    sheet.setColumnWidth(4, 90);  // Coins
    sheet.setColumnWidth(5, 90);  // World
    sheet.setColumnWidth(6, 120); // Photo Avatar
    sheet.setFrozenRows(1);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "ERROR",
        message: "Missing POST body"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var expectedToken = PropertiesService.getScriptProperties().getProperty("MARIO_SHEETS_TOKEN") || "mario_secret_token_123";

    // Authenticate token (defaults to mario_secret_token_123 if not configured)
    if (expectedToken && data.token && data.token !== expectedToken) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "UNAUTHORIZED",
        message: "Invalid token"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var name = String(data.name || "PLAYER1").slice(0, 10).toUpperCase().replace(/[^A-Z0-9 _-]/g, "");
    var score = Math.max(0, Math.min(999999, parseInt(data.score, 10) || 0));
    var coins = Math.max(0, Math.min(9999, parseInt(data.coins, 10) || 0));
    var level = Math.max(1, Math.min(4, parseInt(data.level, 10) || 1));
    var timestamp = data.timestamp || new Date().toISOString();
    var photoB64 = data.photo_b64 || "";

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    setupSheetIfNeeded(sheet);

    // Check if player already exists in the sheet
    var lastRow = sheet.getLastRow();
    var foundRow = -1;
    var existingScore = -1;

    if (lastRow > 1) {
      var namesAndScores = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
      for (var i = 0; i < namesAndScores.length; i++) {
        if (namesAndScores[i][0] === name) {
          foundRow = i + 2;
          existingScore = parseInt(namesAndScores[i][1], 10) || 0;
          break;
        }
      }
    }

    var photoFormula = "";
    if (photoB64 && photoB64.startsWith("data:image")) {
      photoFormula = "CAPTURED PHOTO";
    }

    if (foundRow > 1) {
      // Only update if new score is higher
      if (score > existingScore) {
        sheet.getRange(foundRow, 1, 1, 6).setValues([[
          timestamp,
          name,
          score,
          coins,
          "1-" + level,
          photoFormula || sheet.getRange(foundRow, 6).getValue()
        ]]);
      }
    } else {
      // Append new entry
      sheet.appendRow([
        timestamp,
        name,
        score,
        coins,
        "1-" + level,
        photoFormula
      ]);
      var newRowIdx = sheet.getLastRow();
      sheet.getRange(newRowIdx, 1, 1, 6).setHorizontalAlignment("center");
    }

    // Sort leaderboard by Score (Column 3) descending
    var totalRows = sheet.getLastRow();
    if (totalRows > 2) {
      var sortRange = sheet.getRange(2, 1, totalRows - 1, 6);
      sortRange.sort({ column: 3, ascending: false });
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "OK",
      message: "Score recorded successfully"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "ERROR",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    setupSheetIfNeeded(sheet);

    var lastRow = sheet.getLastRow();
    var entries = [];

    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, Math.min(lastRow - 1, 10), 5).getValues();
      for (var i = 0; i < rows.length; i++) {
        entries.push({
          timestamp: rows[i][0],
          name: rows[i][1],
          score: rows[i][2],
          coins: rows[i][3],
          level: rows[i][4]
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "OK",
      entries: entries
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "ERROR",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

