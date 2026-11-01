/**
 * Super Mario Arcade - Google Sheets Cloud Leaderboard Webhook
 * 
 * Automatically records scores, dates, coins, worlds, and renders the player's 
 * captured webcam avatar photo directly in the spreadsheet!
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
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 35);
    sheet.setColumnWidth(1, 180); // Timestamp
    sheet.setColumnWidth(2, 140); // Player Name
    sheet.setColumnWidth(3, 100); // Score
    sheet.setColumnWidth(4, 90);  // Coins
    sheet.setColumnWidth(5, 90);  // World
    sheet.setColumnWidth(6, 80);  // Photo Avatar
    sheet.setFrozenRows(1);
  }
}

function insertAvatarImage(sheet, targetRow, photoB64, name) {
  if (!photoB64 || typeof photoB64 !== "string") return;

  var base64Data = "";
  if (photoB64.indexOf(",") > -1) {
    base64Data = photoB64.split(",")[1];
  } else {
    base64Data = photoB64;
  }
  if (!base64Data || base64Data.length < 100) return;

  try {
    // Remove existing image anchored in column 6 on this row
    var existingImages = sheet.getImages();
    for (var i = 0; i < existingImages.length; i++) {
      var img = existingImages[i];
      var anchor = img.getAnchorCell();
      if (anchor.getRow() === targetRow && anchor.getColumn() === 6) {
        img.remove();
      }
    }

    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, "image/jpeg", (name || "player") + "_avatar.jpg");

    // Make row tall enough for the 48x36 avatar
    sheet.setRowHeight(targetRow, 46);
    sheet.setColumnWidth(6, 80);

    // Insert image centered in cell (Col 6, targetRow)
    sheet.insertImage(blob, 6, targetRow, 16, 5);

    // Clear any leftover text in that cell
    sheet.getRange(targetRow, 6).setValue("");
  } catch (err) {
    Logger.log("insertAvatarImage error: " + err);
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

    var targetRow = -1;

    if (foundRow > 1) {
      // Only update if new score is higher
      if (score >= existingScore) {
        sheet.getRange(foundRow, 1, 1, 5).setValues([[
          timestamp,
          name,
          score,
          coins,
          "1-" + level
        ]]);
        targetRow = foundRow;
      }
    } else {
      // Append new entry
      sheet.appendRow([
        timestamp,
        name,
        score,
        coins,
        "1-" + level,
        ""
      ]);
      targetRow = sheet.getLastRow();
      sheet.getRange(targetRow, 1, 1, 6).setHorizontalAlignment("center").setVerticalAlignment("middle");
    }

    // Sort leaderboard by Score (Column 3) descending
    var totalRows = sheet.getLastRow();
    if (totalRows > 2) {
      var sortRange = sheet.getRange(2, 1, totalRows - 1, 5);
      sortRange.sort({ column: 3, ascending: false });

      // Re-find targetRow for this player after sorting
      var updatedNames = sheet.getRange(2, 2, totalRows - 1, 1).getValues();
      for (var k = 0; k < updatedNames.length; k++) {
        if (updatedNames[k][0] === name) {
          targetRow = k + 2;
          break;
        }
      }
    }

    // Insert or update avatar image at the sorted position
    if (targetRow > 1 && photoB64) {
      insertAvatarImage(sheet, targetRow, photoB64, name);
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
