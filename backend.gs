/**
 * 早餐點餐工具 - 後端腳本 (GAS)
 * 請將此程式碼貼到 Google 試算表的「擴充功能」 > 「Apps Script」中。
 * 部署時請選擇「網頁應用程式」，並設定「誰可以用有權存取」為「任何人」。
 */

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopSheet = ss.getSheetByName('早餐店');
  const priceSheet = ss.getSheetByName('價格');
  
  // 取得店家清單
  const shops = shopSheet.getRange(1, 1, Math.max(1, shopSheet.getLastRow()), 1).getValues().flat().filter(s => s !== "");
  
  // 取得價格清單
  const priceData = priceSheet.getDataRange().getValues();
  const menu = [];
  // 假設標題為：早餐店	餐點	價格
  for (let i = 1; i < priceData.length; i++) {
    if (priceData[i][0] && priceData[i][1]) {
      menu.push({
        shop: priceData[i][0],
        item: priceData[i][1],
        price: priceData[i][2] || 0,
        rowIndex: i + 1
      });
    }
  }
  
  // 取得紀錄 (顯示最後 20 筆)
  // 欄位結構：取餐日期, 取餐時間, 餐點, 總金額
  const recordSheet = ss.getSheetByName('紀錄');
  const recordData = recordSheet.getDataRange().getValues();
  const records = [];
  
  for (let i = Math.max(1, recordData.length - 20); i < recordData.length; i++) {
    if (recordData[i][0]) {
      records.push({
        pickupDate: recordData[i][0],
        pickupTime: recordData[i][1],
        items: recordData[i][2],
        total: recordData[i][3]
      });
    }
  }
  
  const result = {
    shops: shops,
    menu: menu,
    records: records.reverse() // 最新紀錄排前面
  };
  
  // 處理 CORS 問題的 JSONP 機制 (如果有提供 callback 參數)
  if (e && e.parameter && e.parameter.callback) {
    return ContentService.createTextOutput(e.parameter.callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = params.action || 'submitOrder';
    
    if (action === 'submitOrder') {
      const recordSheet = ss.getSheetByName('紀錄');
      recordSheet.appendRow([
        params.pickupDate,
        params.pickupTime,
        params.items,
        params.total
      ]);
    } else if (action === 'addShop') {
      if (params.password !== '496527') throw new Error('管理員密碼錯誤');
      const shopSheet = ss.getSheetByName('早餐店');
      shopSheet.appendRow([params.shopName]);
    } else if (action === 'addMeal') {
      if (params.password !== '496527') throw new Error('管理員密碼錯誤');
      const priceSheet = ss.getSheetByName('價格');
      priceSheet.appendRow([params.shop, params.item, params.price, params.hasTemp, params.hasSugar]);
    } else if (action === 'deleteMeal') {
      if (params.password !== '496527') throw new Error('管理員密碼錯誤');
      const priceSheet = ss.getSheetByName('價格');
      const itemVal = priceSheet.getRange(params.rowIndex, 2).getValue();
      if (itemVal === params.item) {
        priceSheet.deleteRow(params.rowIndex);
      } else {
        throw new Error('找不到該餐點，可能已被刪除或位置已變動。請重新整理頁面。');
      }
    } else {
      throw new Error('未知的操作');
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
