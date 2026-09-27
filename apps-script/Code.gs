const ARTICLE_BASE_HEADERS = ["barcode", "name", "quantity", "updated_at", "last_command_id"];
const ARTICLE_HEADERS = ARTICLE_BASE_HEADERS.concat(["group_id", "group_name", "photo_file_id"]);
const MOVEMENT_HEADERS = ["id", "timestamp", "barcode", "name", "type", "quantity", "delta"];
const SCHEMA_VERSION = 2;

function setupStockroom() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Open this script from its bound Google Sheet before setup.");
  PropertiesService.getScriptProperties().setProperty("STOCKROOM_SPREADSHEET_ID", spreadsheet.getId());
  migrateStockroom_();
}

function doGet(event) {
  const parameters = (event && event.parameter) || {};
  if (parameters.action === "getPhoto" && parameters.nonce) {
    try {
      const folderId = PropertiesService.getScriptProperties().getProperty("STOCKROOM_IMAGES_FOLDER_ID");
      if (!folderId || !/^[\w-]{10,200}$/.test(String(parameters.fileId || ""))) {
        throw new Error("Invalid article photo request.");
      }
      const file = DriveApp.getFileById(parameters.fileId);
      const parents = file.getParents();
      let belongsToImagesFolder = false;
      while (parents.hasNext()) {
        if (parents.next().getId() === folderId) {
          belongsToImagesFolder = true;
          break;
        }
      }
      if (!belongsToImagesFolder) throw new Error("The requested photo is not in the Stockroom Images folder.");
      const blob = file.getBlob();
      const bytes = blob.getBytes();
      if (blob.getContentType() !== "image/jpeg" || bytes.length > 250000) {
        throw new Error("The article photo is invalid or too large.");
      }
      const photo = "data:image/jpeg;base64," + Utilities.base64Encode(bytes);
      return response_(parameters.nonce, true, photo);
    } catch (error) {
      return response_(parameters.nonce, false, null, error.message || "Could not read the article photo.");
    }
  }

  if (parameters.action !== "getStock" || !parameters.nonce) {
    return response_(parameters.nonce || "", false, null, "Unknown stock action.");
  }

  try {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      migrateStockroom_();
      const sheet = getSheet_("Articles", ARTICLE_HEADERS);
      const lastRow = sheet.getLastRow();
      const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues() : [];
      const barcodeColumn = headerColumn_(sheet, "barcode") - 1;
      const groupIdColumn = headerColumn_(sheet, "group_id") - 1;
      const groupNameColumn = headerColumn_(sheet, "group_name") - 1;
      const quantityColumn = headerColumn_(sheet, "quantity") - 1;
      const nameColumn = headerColumn_(sheet, "name") - 1;
      const updatedAtColumn = headerColumn_(sheet, "updated_at") - 1;
      const photoColumn = headerColumn_(sheet, "photo_file_id") - 1;
      const groupCounts = Object.create(null);
      rows.forEach(function (row) {
        if (row[groupIdColumn] && row[groupNameColumn]) {
          const groupId = String(row[groupIdColumn]);
          groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
        }
      });
      const articles = rows
        .filter(function (row) { return row[barcodeColumn] !== ""; })
        .map(function (row) {
          const article = {
            barcode: String(row[barcodeColumn]),
            name: String(row[nameColumn]),
            quantity: Number(row[quantityColumn]) || 0,
            updatedAt: row[updatedAtColumn] instanceof Date ? row[updatedAtColumn].toISOString() : String(row[updatedAtColumn] || "")
          };
          if (row[groupIdColumn] && row[groupNameColumn] && groupCounts[String(row[groupIdColumn])] > 1) {
            article.groupId = String(row[groupIdColumn]);
            article.groupName = String(row[groupNameColumn]);
          }
          if (row[photoColumn]) article.photoFileId = String(row[photoColumn]);
          return article;
        });
      return response_(parameters.nonce, true, articles);
    } finally {
      lock.releaseLock();
    }
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
      migrateStockroom_();
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

  if (hasMovement_(movements, command.id)) {
    if (command.kind === "delete") {
      const deletedRow = findArticleRow_(articles, command.barcode);
      if (deletedRow >= 2) {
        const deleted = getArticleRow_(articles, deletedRow);
        articles.deleteRow(deletedRow);
        clearSingletonGroup_(articles, String(deleted.group_id || ""));
        if (deleted.photo_file_id) DriveApp.getFileById(String(deleted.photo_file_id)).setTrashed(true);
      }
    }
    return true;
  }

  const lookupBarcode = command.kind === "update" ? command.previousBarcode : command.barcode;
  let rowNumber = command.kind === "set-group" ? -1 : findArticleRow_(articles, lookupBarcode);
  const timestamp = new Date(command.createdAt);
  let articleName;
  let movementType;
  let quantity;
  let delta;

  if (command.kind === "create") {
    if (rowNumber > 0) {
      const existing = getArticleRow_(articles, rowNumber);
      if (String(existing.last_command_id) !== command.id) {
        throw new Error("An article with this barcode already exists.");
      }
      articleName = String(existing.name);
      quantity = command.quantity;
      movementType = "opening";
      delta = quantity;
    } else {
      articleName = command.name.trim();
      quantity = command.quantity;
      movementType = "opening";
      delta = quantity;
      appendArticle_(articles, {
        barcode: command.barcode,
        name: articleName,
        quantity: quantity,
        updated_at: timestamp,
        last_command_id: command.id
      });
    }
  } else if (command.kind === "movement") {
    if (rowNumber < 2) throw new Error("This barcode is not registered in the stock sheet.");
    const row = getArticleRow_(articles, rowNumber);
    articleName = String(row.name);
    const previousQuantity = Number(row.quantity);
    if (String(row.last_command_id) === command.id) {
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
      setArticleFields_(articles, rowNumber, {
        quantity: nextQuantity,
        updated_at: timestamp,
        last_command_id: command.id
      });
    }
  } else if (command.kind === "update") {
    if (rowNumber < 2) {
      rowNumber = findArticleRow_(articles, command.barcode);
      if (rowNumber < 2) throw new Error("This article is not registered in the stock sheet.");
      const current = getArticleRow_(articles, rowNumber);
      if (String(current.last_command_id) !== command.id) {
        throw new Error("This article changed before the update could be applied.");
      }
      articleName = String(current.name);
    } else {
      const current = getArticleRow_(articles, rowNumber);
      const targetRow = findArticleRow_(articles, command.barcode);
      if (targetRow >= 2 && targetRow !== rowNumber) {
        throw new Error("An article with this barcode already exists.");
      }
      articleName = command.name.trim();
      setArticleFields_(articles, rowNumber, {
        barcode: command.barcode,
        name: articleName,
        quantity: Number(current.quantity) || 0,
        updated_at: timestamp,
        last_command_id: command.id
      });
    }
    movementType = "edit";
    quantity = 0;
    delta = 0;
  } else if (command.kind === "delete") {
    if (rowNumber < 2) throw new Error("This article is not registered in the stock sheet.");
    const current = getArticleRow_(articles, rowNumber);
    articleName = String(current.name);
    quantity = Number(current.quantity) || 0;
    movementType = "delete";
    delta = -quantity;
    appendMovement_(movements, {
      id: command.id,
      timestamp: timestamp,
      barcode: command.barcode,
      name: articleName,
      type: movementType,
      quantity: quantity,
      delta: delta
    });
    articles.deleteRow(rowNumber);
    clearSingletonGroup_(articles, String(current.group_id || ""));
    if (current.photo_file_id) DriveApp.getFileById(String(current.photo_file_id)).setTrashed(true);
    return true;
  } else if (command.kind === "set-group") {
    const rows = [];
    const currentGroupRows = findGroupRows_(articles, command.groupId);
    currentGroupRows.forEach(function (groupRow) {
      const existingGroupName = getArticleRow_(articles, groupRow).group_name;
      if (existingGroupName && String(existingGroupName) !== command.groupName.trim()) {
        throw new Error("The group name changed before the update could be applied.");
      }
    });
    command.barcodes.forEach(function (barcode) {
      const memberRow = findArticleRow_(articles, barcode);
      if (memberRow < 2) throw new Error("A selected article is no longer in the stock sheet.");
      const member = getArticleRow_(articles, memberRow);
      if (
        member.group_id &&
        String(member.group_id) !== command.groupId &&
        countGroupMembers_(articles, String(member.group_id)) > 1
      ) {
        throw new Error("A selected article already belongs to another group.");
      }
      rows.push(memberRow);
    });
    rows.forEach(function (memberRow) {
      setArticleFields_(articles, memberRow, {
        group_id: command.groupId,
        group_name: command.groupName.trim()
      });
    });
    appendMovement_(movements, {
      id: command.id,
      timestamp: timestamp,
      barcode: "",
      name: command.groupName.trim(),
      type: "group",
      quantity: rows.length,
      delta: 0
    });
    return true;
  } else if (command.kind === "remove-group-member") {
    if (rowNumber < 2) throw new Error("This article is no longer in the stock sheet.");
    const current = getArticleRow_(articles, rowNumber);
    if (current.group_id && String(current.group_id) !== command.groupId) {
      throw new Error("This article no longer belongs to that group.");
    }
    if (String(current.group_id || "") === command.groupId) {
      setArticleFields_(articles, rowNumber, { group_id: "", group_name: "" });
    }
    clearSingletonGroup_(articles, command.groupId);
    appendMovement_(movements, {
      id: command.id,
      timestamp: timestamp,
      barcode: command.barcode,
      name: String(current.name),
      type: "ungroup",
      quantity: 0,
      delta: 0
    });
    return true;
  } else if (command.kind === "set-photo") {
    if (rowNumber < 2) throw new Error("This article is no longer in the stock sheet.");
    const current = getArticleRow_(articles, rowNumber);
    if (String(current.last_command_id || "") === command.id) {
      if (!hasMovement_(movements, command.id)) {
        appendMovement_(movements, {
          id: command.id,
          timestamp: timestamp,
          barcode: command.barcode,
          name: String(current.name),
          type: "photo",
          quantity: 0,
          delta: 0
        });
      }
      return true;
    }
    const folderId = PropertiesService.getScriptProperties().getProperty("STOCKROOM_IMAGES_FOLDER_ID");
    if (!folderId) throw new Error("Run setupStockroom to configure the shared photo folder.");
    const encoded = command.photoDataUrl.split(",")[1];
    const bytes = Utilities.base64Decode(encoded);
    if (bytes.length > 250000) throw new Error("The compressed photo exceeds the size limit.");
    const folder = DriveApp.getFolderById(folderId);
    const imageName = "stockroom-" + command.id + ".jpg";
    const matchingImages = folder.getFilesByName(imageName);
    const image = matchingImages.hasNext()
      ? matchingImages.next()
      : folder.createFile(Utilities.newBlob(bytes, "image/jpeg", imageName));
    setArticleFields_(articles, rowNumber, {
      photo_file_id: image.getId(),
      last_command_id: command.id,
      updated_at: timestamp
    });
    appendMovement_(movements, {
      id: command.id,
      timestamp: timestamp,
      barcode: command.barcode,
      name: String(current.name),
      type: "photo",
      quantity: 0,
      delta: 0
    });
    if (current.photo_file_id) DriveApp.getFileById(String(current.photo_file_id)).setTrashed(true);
    return true;
  }

  if (!hasMovement_(movements, command.id)) {
    appendMovement_(movements, {
      id: command.id,
      timestamp: timestamp,
      barcode: command.barcode,
      name: articleName,
      type: movementType,
      quantity: quantity,
      delta: delta
    });
  }
  return true;
}

function validateCommand_(command) {
  if (!command || typeof command !== "object" || !/^[\w-]{8,80}$/.test(String(command.id || ""))) {
    throw new Error("Invalid command identifier.");
  }
  if (
    command.kind !== "set-group" &&
    (!String(command.barcode || "").trim() || String(command.barcode).length > 160)
  ) {
    throw new Error("Invalid barcode.");
  }
  if (command.kind === "create") {
    if (!Number.isSafeInteger(command.quantity) || command.quantity < 0) {
      throw new Error("Quantity must be a non-negative whole number.");
    }
    if (!String(command.name || "").trim() || String(command.name).length > 120) {
      throw new Error("Article name is required.");
    }
    if (!command.createdAt || isNaN(new Date(command.createdAt).getTime())) {
      throw new Error("Invalid creation date.");
    }
    return;
  }
  if (command.kind === "update") {
    if (!String(command.previousBarcode || "").trim() || String(command.previousBarcode).length > 160) {
      throw new Error("Invalid existing barcode.");
    }
    if (!String(command.name || "").trim() || String(command.name).length > 120) {
      throw new Error("Article name is required.");
    }
    if (!command.createdAt || isNaN(new Date(command.createdAt).getTime())) {
      throw new Error("Invalid update date.");
    }
    return;
  }
  if (command.kind === "delete") {
    if (!command.createdAt || isNaN(new Date(command.createdAt).getTime())) {
      throw new Error("Invalid deletion date.");
    }
    return;
  }
  if (command.kind === "set-group") {
    if (
      !/^[\w-]{8,80}$/.test(String(command.groupId || "")) ||
      !Array.isArray(command.barcodes) ||
      command.barcodes.length < 2 ||
      command.barcodes.some(function (barcode) {
        return typeof barcode !== "string" || !barcode.trim() || barcode.length > 160;
      }) ||
      new Set(command.barcodes).size !== command.barcodes.length ||
      !String(command.groupName || "").trim() ||
      String(command.groupName).length > 120 ||
      !command.createdAt ||
      isNaN(new Date(command.createdAt).getTime())
    ) {
      throw new Error("Invalid article group.");
    }
    return;
  }
  if (command.kind === "remove-group-member") {
    if (
      !/^[\w-]{8,80}$/.test(String(command.groupId || "")) ||
      !command.createdAt ||
      isNaN(new Date(command.createdAt).getTime())
    ) {
      throw new Error("Invalid group member removal.");
    }
    return;
  }
  if (command.kind === "set-photo") {
    if (
      typeof command.photoDataUrl !== "string" ||
      command.photoDataUrl.length > 340000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(command.photoDataUrl) ||
      !command.createdAt ||
      isNaN(new Date(command.createdAt).getTime())
    ) {
      throw new Error("Invalid article photo.");
    }
    return;
  }
  if (
    command.kind !== "movement" ||
    (command.movementType !== "add" && command.movementType !== "remove") ||
    !Number.isSafeInteger(command.quantity) ||
    command.quantity < 1 ||
    !command.createdAt ||
    isNaN(new Date(command.createdAt).getTime())
  ) {
    throw new Error("Invalid stock movement.");
  }
}

function migrateStockroom_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("STOCKROOM_SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("Run setupStockroom from the bound sheet's Apps Script editor first.");
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const properties = PropertiesService.getScriptProperties();
  const currentVersion = Number(properties.getProperty("STOCKROOM_SCHEMA_VERSION")) || 0;

  if (currentVersion < 1) ensureSheetHeaders_(spreadsheet, "Articles", ["group_id", "group_name"]);
  if (currentVersion < 2) ensureSheetHeaders_(spreadsheet, "Articles", ["photo_file_id"]);
  ensureSheetHeaders_(spreadsheet, "Articles", ARTICLE_HEADERS);
  ensureSheetHeaders_(spreadsheet, "Movements", MOVEMENT_HEADERS);
  ensureImagesFolder_(spreadsheetId);
  properties.setProperty("STOCKROOM_SCHEMA_VERSION", String(SCHEMA_VERSION));
}

function ensureImagesFolder_(spreadsheetId) {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty("STOCKROOM_IMAGES_FOLDER_ID");
  if (existingId) {
    try {
      DriveApp.getFolderById(existingId).getName();
      return;
    } catch (error) {
      console.warn("The configured Stockroom Images folder is unavailable; creating a replacement.", error);
      properties.deleteProperty("STOCKROOM_IMAGES_FOLDER_ID");
    }
  }
  const spreadsheetFile = DriveApp.getFileById(spreadsheetId);
  const parents = spreadsheetFile.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const folder = parent.createFolder("Stockroom Images");
  properties.setProperty("STOCKROOM_IMAGES_FOLDER_ID", folder.getId());
}

function ensureSheetHeaders_(spreadsheet, name, requiredHeaders) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  let headers = readHeaders_(sheet);
  requiredHeaders.forEach(function (header) {
    if (headers.indexOf(header) < 0) {
      const column = sheet.getLastColumn() + 1;
      sheet.getRange(1, column).setValue(header);
      headers.push(header);
    }
  });
  return sheet;
}

function getSheet_(name, headers) {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("STOCKROOM_SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("Run setupStockroom from the bound sheet's Apps Script editor first.");
  const sheet = ensureSheetHeaders_(SpreadsheetApp.openById(spreadsheetId), name, headers);
  if (name === "Articles") {
    ["barcode", "group_id", "group_name", "photo_file_id"].forEach(function (header) {
      sheet.getRange(1, headerColumn_(sheet, header), sheet.getMaxRows(), 1).setNumberFormat("@");
    });
  }
  return sheet;
}

function readHeaders_(sheet) {
  const columnCount = sheet.getLastColumn();
  if (columnCount < 1) return [];
  const headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0].map(function (value) {
    return String(value || "").trim();
  });
  const seen = Object.create(null);
  headers.forEach(function (header) {
    if (!header) return;
    if (seen[header]) throw new Error("The " + sheet.getName() + " sheet contains a duplicate " + header + " column.");
    seen[header] = true;
  });
  return headers;
}

function headerColumn_(sheet, header) {
  const index = readHeaders_(sheet).indexOf(header);
  if (index < 0) throw new Error("The " + sheet.getName() + " sheet is missing the " + header + " column.");
  return index + 1;
}

function getArticleRow_(sheet, rowNumber) {
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = readHeaders_(sheet);
  const record = {};
  headers.forEach(function (header, index) {
    if (header) record[header] = values[index];
  });
  return record;
}

function setArticleFields_(sheet, rowNumber, fields) {
  Object.keys(fields).forEach(function (header) {
    sheet.getRange(rowNumber, headerColumn_(sheet, header)).setValue(fields[header]);
  });
}

function appendArticle_(sheet, fields) {
  appendRecord_(sheet, fields);
}

function appendMovement_(sheet, fields) {
  appendRecord_(sheet, fields);
}

function appendRecord_(sheet, fields) {
  const headers = readHeaders_(sheet);
  const row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(fields, header) ? fields[header] : "";
  });
  sheet.appendRow(row);
}

function clearSingletonGroup_(sheet, groupId) {
  if (!groupId) return;
  const members = findGroupRows_(sheet, groupId);
  if (members.length === 1) {
    setArticleFields_(sheet, members[0], { group_id: "", group_name: "" });
  }
}

function findGroupRows_(sheet, groupId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, headerColumn_(sheet, "group_id"), lastRow - 1, 1).getValues();
  const members = [];
  rows.forEach(function (row, index) {
    if (String(row[0] || "") === groupId) members.push(index + 2);
  });
  return members;
}

function countGroupMembers_(sheet, groupId) {
  return findGroupRows_(sheet, groupId).length;
}

function findArticleRow_(sheet, barcode) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const match = sheet.getRange(2, headerColumn_(sheet, "barcode"), lastRow - 1, 1)
    .createTextFinder(String(barcode))
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : -1;
}

function hasMovement_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return Boolean(sheet.getRange(2, headerColumn_(sheet, "id"), lastRow - 1, 1)
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
