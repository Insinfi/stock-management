const ARTICLE_HEADERS = ["barcode", "name", "quantity", "updated_at", "last_command_id"];
const MOVEMENT_HEADERS = ["id", "timestamp", "barcode", "name", "type", "quantity", "delta"];

function setupStockroom() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Open this script from its bound Google Sheet before setup.");
  PropertiesService.getScriptProperties().setProperty("STOCKROOM_SPREADSHEET_ID", spreadsheet.getId());
  getSheet_("Articles", ARTICLE_HEADERS);
  getSheet_("Movements", MOVEMENT_HEADERS);
}

function doGet(event) {
  const parameters = (event && event.parameter) || {};
  if (parameters.action !== "getStock" || !parameters.nonce) {
    return response_(parameters.nonce || "", false, null, "Unknown stock action.");
  }

  try {
    const sheet = getSheet_("Articles", ARTICLE_HEADERS);
    const lastRow = sheet.getLastRow();
    const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, ARTICLE_HEADERS.length).getValues() : [];
    const articles = rows
      .filter(function (row) { return row[0] !== ""; })
      .map(function (row) {
        return {
          barcode: String(row[0]),
          name: String(row[1]),
          quantity: Number(row[2]) || 0,
          updatedAt: row[3] instanceof Date ? row[3].toISOString() : String(row[3] || "")
        };
      });
    return response_(parameters.nonce, true, articles);
  } catch (error) {
    return response_(parameters.nonce, false, null, error.message || "Could not read the stock sheet.");
  }
}

function doPost(event) {
  const parameters = (event && event.parameter) || {};
  if (parameters.action !== "command" || !parameters.nonce || !parameters.payload) {
    return response_(parameters.nonce || "", false, null, "Invalid stock command.");
  }

  try {
    const command = JSON.parse(parameters.payload);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const result = applyCommand_(command);
      return response_(parameters.nonce, true, result);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return response_(parameters.nonce, false, null, error.message || "Could not save the stock movement.");
  }
}

function applyCommand_(command) {
  validateCommand_(command);
  const articles = getSheet_("Articles", ARTICLE_HEADERS);
  const movements = getSheet_("Movements", MOVEMENT_HEADERS);

  if (hasMovement_(movements, command.id)) return true;

  const rowNumber = findArticleRow_(articles, command.barcode);
  const timestamp = new Date(command.createdAt);
  let articleName;
  let movementType;
  let quantity;
  let delta;

  if (command.kind === "create") {
    if (rowNumber > 0) {
      const existing = articles.getRange(rowNumber, 1, 1, ARTICLE_HEADERS.length).getValues()[0];
      if (String(existing[4]) !== command.id) {
        throw new Error("An article with this barcode already exists.");
      }
      articleName = String(existing[1]);
      quantity = command.quantity;
      movementType = "opening";
      delta = quantity;
    } else {
      articleName = command.name.trim();
      quantity = command.quantity;
      movementType = "opening";
      delta = quantity;
      articles.appendRow([command.barcode, articleName, quantity, timestamp, command.id]);
    }
  } else {
    if (rowNumber < 2) throw new Error("This barcode is not registered in the stock sheet.");
    const row = articles.getRange(rowNumber, 1, 1, ARTICLE_HEADERS.length).getValues()[0];
    articleName = String(row[1]);
    const previousQuantity = Number(row[2]);
    if (String(row[4]) === command.id) {
      quantity = command.quantity;
      movementType = command.movementType;
      delta = movementType === "add" ? quantity : -quantity;
    } else {
      quantity = command.quantity;
      movementType = command.movementType;
      delta = movementType === "add" ? quantity : -quantity;
      const nextQuantity = previousQuantity + delta;
      if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) {
        throw new Error("The movement would make stock negative.");
      }
      articles.getRange(rowNumber, 3, 1, 3).setValues([[nextQuantity, timestamp, command.id]]);
    }
  }

  if (!hasMovement_(movements, command.id)) {
    movements.appendRow([command.id, timestamp, command.barcode, articleName, movementType, quantity, delta]);
  }
  return true;
}

function validateCommand_(command) {
  if (!command || typeof command !== "object" || !/^[\w-]{8,80}$/.test(String(command.id || ""))) {
    throw new Error("Invalid command identifier.");
  }
  if (!String(command.barcode || "").trim() || String(command.barcode).length > 160) {
    throw new Error("Invalid barcode.");
  }
  if (!Number.isSafeInteger(command.quantity) || command.quantity < 0) {
    throw new Error("Quantity must be a non-negative whole number.");
  }
  if (command.kind === "create") {
    if (!String(command.name || "").trim() || String(command.name).length > 120) {
      throw new Error("Article name is required.");
    }
    if (!command.createdAt || isNaN(new Date(command.createdAt).getTime())) {
      throw new Error("Invalid creation date.");
    }
    return;
  }
  if (
    command.kind !== "movement" ||
    (command.movementType !== "add" && command.movementType !== "remove") ||
    command.quantity < 1 ||
    !command.createdAt ||
    isNaN(new Date(command.createdAt).getTime())
  ) {
    throw new Error("Invalid stock movement.");
  }
}

function getSheet_(name, headers) {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("STOCKROOM_SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("Run setupStockroom from the bound sheet's Apps Script editor first.");
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (headers.some(function (header, index) { return currentHeaders[index] !== header; })) {
      throw new Error("The " + name + " sheet has unexpected columns. Do not rename its header row.");
    }
  }
  if (name === "Articles") {
    sheet.getRange("A:B").setNumberFormat("@");
  } else {
    sheet.getRange("C:D").setNumberFormat("@");
  }
  return sheet;
}

function findArticleRow_(sheet, barcode) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(String(barcode))
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : -1;
}

function hasMovement_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return Boolean(sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .findNext());
}

function response_(nonce, ok, data, error) {
  const payload = JSON.stringify({ nonce: nonce, ok: ok, data: data, error: error })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const html = "<!doctype html><html><body><script>" +
    "window.top.postMessage(" + payload + ",'*');" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
