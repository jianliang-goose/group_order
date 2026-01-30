function doGet(e) {
  // Optimization: No lock needed for simple reads (Config/Orders)
  // This drastically improves concurrent load times.
  
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    
    // Check if we are requesting config
    if (e.parameter && e.parameter.type === 'config') {
      return getConfig(doc);
    } else if (e.parameter && e.parameter.type === 'orders') {
      return getOrders(doc);
    }
    
    return ContentService.createTextOutput("Hello! The Web App is running.");
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getConfig(doc) {
  // 1. Products Sheet
  var productSheet = doc.getSheetByName('Products');
  if (!productSheet) {
    productSheet = doc.insertSheet('Products');
    productSheet.appendRow(['ID', 'Name', 'Price', 'Description', 'Image', 'Category', 'DiscountPrice', 'PromoTag', 'PromoDesc']);
    // Seed default data
    var defaultProducts = [
      ['p1', '茶香鵝肉 (1/4 隻)', 420, '嚴選優質鵝肉，獨家茶燻工法，皮薄肉嫩多汁。兩盒以上可享肉燥包加購優惠！', 'images/goose-quarter.png', 'main', '', '', ''],
      ['p2', '肥仔鵝肉燥包', 300, '每買 2 盒「1/4 茶香鵝肉」，即可以 $250 加購 1 包！(原價 $300)', 'images/goose-sauce.png', 'addon', 250, '加購優惠', ''],
      ['p3', '拜拜整隻茶鵝', 1500, '整隻全鵝，祭祀拜拜首選。大氣美觀，香氣四溢。', 'images/goose-whole.png', 'main', '', '', ''],
      ['p4', '煙燻鵝腳 (1 包)', 150, '富含膠質，Q彈有嚼勁，下酒追劇良伴。', 'images/goose-feet.png', 'snack', '', '', ''],
      ['p5', '煙燻鵝舌 (17 隻)', 300, '精選鵝舌，滷製入味，口感獨特。', 'images/goose-tongue.png', 'snack', '', '', '']
    ];
    defaultProducts.forEach(row => productSheet.appendRow(row));
  }

  // 2. Settings Sheet
  var settingSheet = doc.getSheetByName('Settings');
  if (!settingSheet) {
    settingSheet = doc.insertSheet('Settings');
    settingSheet.appendRow(['Key', 'Value']);
    var defaultSettings = [
      ['close_date', '2026/02/10'],
      ['shipping_date', '2026/02/09'],
      ['pickup_date', '2026/02/15 (19:00 前)'],
      ['shipping_threshold', '3000'],
      ['shipping_fee', '120'],
      ['group_leaders', '無,宛儒'],
      ['is_open', 'true']
    ];
    defaultSettings.forEach(row => settingSheet.appendRow(row));
  }

  // Read Data
  var products = getDataFromSheet(productSheet);
  var settings = getDataFromSheet(settingSheet);
  
  // Convert settings array to object
  var settingsObj = {};
  settings.forEach(function(s) {
    settingsObj[s.Key] = s.Value;
  });

  var response = {
    products: products,
    settings: settingsObj
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrders(doc) {
  var sheet = doc.getSheetByName('Orders');
  // If no orders sheet, return empty list
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var data = getDataFromSheet(sheet);
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDataFromSheet(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var results = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    results.push(obj);
  }
  return results;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); 

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (error) {
       data = e.parameter;
    }

    // Dispatch based on action
    // Dispatch based on action
    if (data.action === 'updateOrder') {
      return updateOrder(doc, data);
    } else if (data.action === 'updateOrderFull') {
      return updateOrderFull(doc, data);
    } else if (data.action === 'saveSettings') {
      return saveSettings(doc, data);
    } else if (data.items || data.totalAmount || data.phone || !data.action) {
       // Heuristic: If it has order-like fields OR no action (legacy support), treat as order
       return createOrder(doc, data);
    } else {
       return ContentService.createTextOutput(JSON.stringify({result: "error", error: "Unknown action"}))
         .setMimeType(ContentService.MimeType.JSON);
    }

  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ "result": "error", "error": e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function updateOrder(doc, data) {
  var sheet = doc.getSheetByName('Orders');
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  // Find Columns
  var idIndex = headers.indexOf('Order_ID');
  var statusIndex = headers.indexOf('Status');
  var noteIndex = headers.indexOf('Note');
  var paymentVerifiedIndex = headers.indexOf('Payment_Verified');

  // Add Note column if missing
  if (noteIndex === -1) {
    sheet.getRange(1, headers.length + 1).setValue('Note');
    noteIndex = headers.length; 
  }

  // Add Payment_Verified column if missing
  if (paymentVerifiedIndex === -1) {
    sheet.getRange(1, headers.length + 1).setValue('Payment_Verified');
    paymentVerifiedIndex = headers.length;
  }

  // Find Row
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idIndex]) === String(data.orderId)) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("Order not found: " + data.orderId);
  }

  // Update
  if (data.status) {
    sheet.getRange(rowIndex, statusIndex + 1).setValue(data.status);
  }
  if (data.note !== undefined) { // Allow empty string
    sheet.getRange(rowIndex, noteIndex + 1).setValue(data.note);
  }
  if (data.paymentVerified !== undefined) {
    sheet.getRange(rowIndex, paymentVerifiedIndex + 1).setValue(data.paymentVerified);
  }

  return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
      .setMimeType(ContentService.MimeType.JSON);
}

function updateOrderFull(doc, data) {
  var sheet = doc.getSheetByName('Orders');
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  // Find Order Row
  var idIndex = headers.indexOf('Order_ID');
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idIndex]) === String(data.orderId)) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("Order not found: " + data.orderId);
  }

  // Helper function to set cell value by column name
  function setCell(columnName, value) {
    var colIndex = headers.indexOf(columnName);
    if (colIndex === -1) {
      // Add column if missing
      colIndex = headers.length;
      sheet.getRange(1, colIndex + 1).setValue(columnName);
      headers.push(columnName);
    }
    if (value !== undefined) {
      sheet.getRange(rowIndex, colIndex + 1).setValue(value);
    }
  }

  // Update all fields
  setCell('Name', data.name);
  setCell('Phone', "'" + data.phone);
  setCell('Group_Leader', data.groupLeader);
  setCell('Items', data.items);
  setCell('Total_Amount', data.totalAmount);
  setCell('Shipping_Fee', data.shippingFee);
  setCell('Grand_Total', data.grandTotal);
  setCell('Delivery_Method', data.deliveryMethod);
  setCell('Store_Info', data.storeInfo);
  setCell('Payment_Method', data.paymentMethod);
  setCell('Payment_Info', data.paymentInfo);
  setCell('Status', data.status);
  setCell('Payment_Verified', data.paymentVerified);
  setCell('Note', data.note);

  return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
      .setMimeType(ContentService.MimeType.JSON);
}

function saveSettings(doc, data) {
  // 1. Update Settings Sheet
  var settingSheet = doc.getSheetByName('Settings');
  settingSheet.clearContents();
  settingSheet.appendRow(['Key', 'Value']);
  
  if (data.settings) {
    for (var key in data.settings) {
      settingSheet.appendRow([key, data.settings[key]]);
    }
  }

  // 2. Update Products Sheet
  if (data.products && Array.isArray(data.products)) {
    var productSheet = doc.getSheetByName('Products');
    productSheet.clearContents();
    productSheet.appendRow(['ID', 'Name', 'Price', 'Description', 'Image', 'Category', 'DiscountPrice', 'PromoTag', 'PromoDesc', 'PromoTargetQty']);
    
    data.products.forEach(function(p) {
      productSheet.appendRow([
        p.ID || '',
        p.Name || '',
        p.Price || 0,
        p.Description || '',
        p.Image || '',
        p.Category || '',
        p.DiscountPrice || '',
        p.PromoTag || '',
        p.PromoDesc || '',
        p.PromoTargetQty || ''
      ]);
    });
  }

  return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
      .setMimeType(ContentService.MimeType.JSON);
}

function createOrder(doc, data) {
  var sheet = doc.getSheetByName('Orders'); 
  
  if (!sheet) {
     sheet = doc.insertSheet('Orders');
     sheet.appendRow([
       'Timestamp', 'Order_ID', 'Group_Leader', 'Name', 'Phone', 'Items', 
       'Total_Amount', 'Shipping_Fee', 'Grand_Total', 
       'Payment_Method', 'Payment_Info', 'Delivery_Method', 'Store_Info', 'Status', 'Payment_Verified', 'Note'
     ]);
  } else {
     // Check headers and force add missing columns if needed
     var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
     
     // 1. Check Payment_Info
     if (headers.indexOf('Payment_Info') === -1) {
       var paymentMethodIndex = headers.indexOf('Payment_Method');
       if (paymentMethodIndex !== -1) {
         sheet.insertColumnAfter(paymentMethodIndex + 1);
         sheet.getRange(1, paymentMethodIndex + 2).setValue('Payment_Info');
       }
     }

     // 2. Check Payment_Verified
     // Refresh headers in case we added one above
     headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
     if (headers.indexOf('Payment_Verified') === -1) {
        var statusIndex = headers.indexOf('Status');
        // Insert after Status if possible, or just at end
        if (statusIndex !== -1) {
           sheet.insertColumnAfter(statusIndex + 1);
           sheet.getRange(1, statusIndex + 2).setValue('Payment_Verified');
        } else {
           // Append to end
           sheet.getRange(1, headers.length + 1).setValue('Payment_Verified');
        }
     }
  }

  var newRow = [];
  var timestamp = new Date();
  var orderId = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  
  newRow.push(timestamp);
  newRow.push(orderId);
  newRow.push(data.groupLeader || '無');
  newRow.push(data.name || '');
  newRow.push("'"+data.phone || ''); 
  newRow.push(data.items || '');
  newRow.push(data.totalAmount || 0);
  newRow.push(data.shippingFee || 0);
  newRow.push(data.grandTotal || 0);
  newRow.push(data.paymentMethod || '');
  newRow.push(data.paymentInfo || '');
  newRow.push(data.deliveryMethod || '');
  newRow.push(data.storeInfo || '');
  newRow.push('未處理'); 
  newRow.push(''); // Payment_Verified default empty
  newRow.push(''); // Note initially empty

  sheet.appendRow(newRow);

  return ContentService
    .createTextOutput(JSON.stringify({ "result": "success", "orderId": orderId }))
    .setMimeType(ContentService.MimeType.JSON);
}
