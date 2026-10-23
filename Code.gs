/**
 * منصة «حلقة وصل» التعليمية — المعهد العالي لنظم التجارة الإلكترونية بسوهاج
 * سكريبت معالجة واستقبال نتائج الاختبارات (Code.gs)
 * ==============================================================================
 * هذا الملف يتم نسخه بالكامل داخل محرر Google Apps Script المرتبط بجدول Google Sheets
 * لاستقبال نتائج اختبارات الطلاب سحابياً ومجانياً 100% دون الحاجة لسيرفر مدفوع.
 * 
 * طريقة الإعداد والتشغيل في 3 دقائق:
 * ---------------------------------
 * 1. افتح Google Sheets وأنشئ جدولاً جديداً باسم: "سجل نتائج منصة حلقة وصل".
 * 2. من القائمة العلوية اضغط: الإضافات (Extensions) > Apps Script.
 * 3. امسح أي كود موجود، والصق هذا الملف كاملاً مكانه، ثم اضغط حفظ (Ctrl + S).
 * 4. اضغط على زر النشر الأزرق (Deploy) > نشر جديد (New deployment).
 * 5. اختر نوع النشر: تطبيق ويب (Web app).
 * 6. اضبط الإعدادات كالتالي:
 *    - الوصف: استلام نتائج منصة حلقة وصل
 *    - تنفيذ باسم (Execute as): حسابي (Me - your email)
 *    - من يملك حق الوصول (Who has access): أي شخص (Anyone)  <-- مهم جداً ليعمل دون تسجيل دخول
 * 7. اضغط نشر (Deploy) وانسخ الرابط (Web App URL) وضعه في إعدادات المنصة.
 * ==============================================================================
 */

// اسم ورقة العمل الخاصة بتسجيل المحاولات
const SHEET_NAME = "سجل_نتائج_الطلاب";

/**
 * معالجة طلبات الإرسال POST القادمة من منصة حلقة وصل (GitHub Pages)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000); // قفل لحماية البيانات من التداخل عند إرسال عدة طلاب في نفس اللحظة

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);

    // إذا لم تكن ورقة العمل منشأة، نقوم بإنشائها وتنسيق أعمدتها تلقائياً
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      const headers = [
        "رقم المحاولة",
        "التاريخ والوقت",
        "اسم الطالب",
        "الفرقة الدراسية",
        "القسم والتخصص",
        "المادة الدراسية",
        "اسم الاختبار",
        "الدرجة المحققة",
        "الدرجة العظمى",
        "النسبة المئوية",
        "عدد الصحيح",
        "عدد الخاطئ",
        "زمن الإجابة (دقائق)",
        "حالة النتيجة"
      ];
      
      sheet.appendRow(headers);
      
      // تنسيق شريط العناوين بالألوان الرسمية للمنصة (أزرق بترولي داكن #193F54)
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#193F54");
      headerRange.setFontColor("#FFFFFF");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }

    // استخراج البيانات القادمة من المنصة
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      throw new Error("لم يتم استلام أي بيانات صالحة في الطلب.");
    }

    // إعداد صف البيانات للحفظ
    const rowData = [
      data.attemptId || ("ATT-" + new Date().getTime()),
      data.timestamp || new Date().toLocaleString("ar-EG"),
      data.studentName || "طالب غير مسجل",
      data.academicYear || "الفرقة الثانية",
      data.specialization || "قسم نظم التجارة الإلكترونية",
      data.subjectTitle || "مقرر المعهد",
      data.quizTitle || "اختبار تدريبي",
      data.score !== undefined ? data.score : 0,
      data.total !== undefined ? data.total : 0,
      (data.percentage !== undefined ? data.percentage + "%" : "0%"),
      data.correctCount !== undefined ? data.correctCount : 0,
      data.wrongCount !== undefined ? data.wrongCount : 0,
      data.minutesSpent !== undefined ? data.minutesSpent : 1,
      data.status || (data.percentage >= 60 ? "ناجح" : "يحتاج مراجعة")
    ];

    // إضافة الصف وتنسيق محاذاته
    sheet.appendRow(rowData);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1, 1, rowData.length).setHorizontalAlignment("center");

    // تنسيق لون حالة النتيجة (أخضر للناجح وأحمر لغير الناجح)
    const statusCell = sheet.getRange(lastRow, 14);
    if (data.percentage >= 60) {
      statusCell.setBackground("#ECFDF5").setFontColor("#065F46");
    } else {
      statusCell.setBackground("#FEF2F2").setFontColor("#991B1B");
    }

    // إرجاع رد نجاح بتنسيق JSON مع دعم CORS
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم حفظ نتيجة الطالب بنجاح في السجل المركزي للمعهد.",
      attemptId: data.attemptId,
      rowNumber: lastRow
    }))
    .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

/**
 * معالجة طلبات الفحص GET للتأكد من عمل الخدمة واسترجاع الإحصاءات المجمعة
 */
function doGet(e) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);

    let totalAttempts = 0;
    if (sheet && sheet.getLastRow() > 1) {
      totalAttempts = sheet.getLastRow() - 1;
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "active",
      platform: "منصة حلقة وصل التعليمية",
      institution: "المعهد العالي لنظم التجارة الإلكترونية بسوهاج",
      totalAttemptsLogged: totalAttempts,
      serverTime: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}
