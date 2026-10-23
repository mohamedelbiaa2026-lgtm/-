/**
 * منصة «حلقة وصل» التعليمية — معهد نظم التجارة الإلكترونية بسوهاج
 * محرك التطبيق والتشغيل التفاعلي (app.js)
 * ----------------------------------------------------------------------------
 * يشتمل على:
 * 1. التنقل بين الواجهات وتفعيل الـ SPA
 * 2. رندرة المقررات والفصول من ملف البيانات المركزي (data.js)
 * 3. محرك الاختبارات التفاعلية وحساب الدرجات وعرض المراجعة التفصيلية
 * 4. حفظ النتائج محلياً وبالسيرفر المركزي (Google Apps Script / Sheets)
 * 5. تصدير التقارير بصيغة Excel / CSV متوافقة مع اللغة العربية
 * 6. المساعد التعليمي الذكي (الوضع المحلي الفوري + دعم اختياري لـ Gemini)
 * 7. لوحة المسؤول المركزي والإحصاءات وعداد الزيارات الحقيقي
 */

class HalqaWaslApp {
  constructor() {
    this.currentView = "home";
    this.activeSubject = null;
    this.activeQuiz = null;
    this.activeQuizState = {
      studentInfo: null,
      currentQuestionIndex: 0,
      answers: {}, // { [questionId]: selectedOptionIndex }
      timerInterval: null,
      secondsElapsed: 0,
      totalSeconds: 0,
      isSubmitted: false
    };

    // إعدادات الربط السحابي (Google Apps Script Web App URL)
    // يمكن تعديله أو تركه فارغاً للاعتماد على التخزين المحلي وتصدير Excel
    this.appsScriptEndpoint = localStorage.getItem("halqa_apps_script_url") || "";
    this.geminiApiKey = localStorage.getItem("halqa_gemini_api_key") || "";

    // تهيئة السجلات المحلية
    this.initStorage();
  }

  // ========================================================================
  // تهيئة النظام والبدء
  // ========================================================================
  init() {
    this.trackVisit();
    this.renderHomeSubjects();
    this.renderAllSubjects();
    this.renderDepartmentsView();
    this.updateStatsCounters();
    this.setupHashRouting();
    this.renderAdminAttemptsTable();

    console.log("🚀 تم تشغيل منصة «حلقة وصل» التعليمية بنجاح — المعهد العالي لنظم التجارة الإلكترونية بسوهاج.");
  }

  initStorage() {
    if (!localStorage.getItem("halqa_attempts")) {
      localStorage.setItem("halqa_attempts", JSON.stringify([]));
    }
  }

  // عداد زيارات حقيقي يحسب الجلسات الفعلية
  trackVisit() {
    let visits = parseInt(localStorage.getItem("halqa_visits_count") || "0", 10);
    const sessionVisited = sessionStorage.getItem("halqa_session_active");
    if (!sessionVisited) {
      visits += 1;
      localStorage.setItem("halqa_visits_count", visits.toString());
      sessionStorage.setItem("halqa_session_active", "true");
    }
    const statVisitsElem = document.getElementById("statVisitsCount");
    if (statVisitsElem) statVisitsElem.textContent = visits.toLocaleString("ar-EG");
  }

  // التوجيه عبر الرابط (Hash Routing) لدعم GitHub Pages بسلاسة
  setupHashRouting() {
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "") || "home";
      this.showView(hash, false);
    });

    // قراءة الرابط عند الفتح لأول مرة
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash && document.getElementById(`${initialHash}-view`)) {
      this.showView(initialHash, false);
    }
  }

  // ========================================================================
  // إدارة التنقل وعرض الصفحات
  // ========================================================================
  showView(viewName, updateHash = true) {
    const validViews = ["home", "departments", "subjects", "subject-detail", "quiz", "ai-tutor", "admin", "stats"];
    if (!validViews.includes(viewName)) viewName = "home";

    // إخفاء كل الواجهات
    document.querySelectorAll(".view-container").forEach(el => el.classList.remove("active"));

    // إظهار الواجهة المطلوبة
    const targetElem = document.getElementById(`${viewName}-view`);
    if (targetElem) {
      targetElem.classList.add("active");
    }

    // تحديث روابط شريط التنقل
    document.querySelectorAll(".nav-link").forEach(link => {
      const href = link.getAttribute("href");
      if (href === `#${viewName}`) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // إغلاق قائمة الموبايل عند التنقل
    const nav = document.getElementById("mainNav");
    if (nav) nav.classList.remove("mobile-active");

    if (updateHash) {
      window.location.hash = viewName;
    }

    this.currentView = viewName;
    window.scrollTo({ top: 0, behavior: "smooth" });

    // تحديث الجداول أو الإحصاءات الخاصة بالواجهة
    if (viewName === "admin") {
      this.renderAdminAttemptsTable();
    } else if (viewName === "stats") {
      this.updateStatsCounters();
    }
  }

  toggleMobileMenu() {
    const nav = document.getElementById("mainNav");
    if (nav) nav.classList.toggle("mobile-active");
  }

  // ========================================================================
  // رندرة بطاقات المقررات الدراسية
  // ========================================================================
  renderHomeSubjects() {
    const container = document.getElementById("homeSubjectsGrid");
    if (!container) return;
    container.innerHTML = PLATFORM_DATA.subjects.map(s => this.createSubjectCardHTML(s)).join("");
  }

  renderAllSubjects() {
    const container = document.getElementById("allSubjectsGrid");
    if (!container) return;
    container.innerHTML = PLATFORM_DATA.subjects.map(s => this.createSubjectCardHTML(s)).join("");
  }

  renderDepartmentsView() {
    const container = document.getElementById("departmentsSubjectsGrid");
    if (!container) return;
    this.filterByAcademicStructure();
  }

  filterByAcademicStructure() {
    const yearSelect = document.getElementById("academicYearSelect");
    const deptSelect = document.getElementById("academicDeptSelect");
    const container = document.getElementById("departmentsSubjectsGrid");
    if (!container) return;

    const selectedYear = yearSelect ? yearSelect.value : "all";
    const selectedDept = deptSelect ? deptSelect.value : "all";

    const filtered = PLATFORM_DATA.subjects.filter(s => {
      const matchYear = (selectedYear === "all" || s.yearId === selectedYear);
      const matchDept = (selectedDept === "all" || s.departmentId === selectedDept);
      return matchYear && matchDept;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: white; border-radius: 12px; border: 1px solid var(--border-color);">
          <i class="fa-solid fa-clock-rotate-left" style="font-size: 2.5rem; color: var(--gold); margin-bottom: 12px;"></i>
          <h3 style="color: var(--primary-dark);">المقررات قيد التجهيز</h3>
          <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto;">المحتوى الدراسي المتاح حالياً يتبع الفرقة الثانية وقسم نظم التجارة الإلكترونية، وسيتم فتح بقية الأقسام والفرق فور اعتمادها.</p>
        </div>
      `;
    } else {
      container.innerHTML = filtered.map(s => this.createSubjectCardHTML(s)).join("");
    }
  }

  createSubjectCardHTML(subject) {
    const totalChapters = subject.chapters.length;
    const availableChapters = subject.chapters.filter(c => c.status === "available").length;

    return `
      <div class="subject-card">
        <div class="subject-card-header">
          <span class="subject-code">${subject.code}</span>
          <div class="subject-icon-box">
            <i class="fa-solid ${subject.icon}"></i>
          </div>
        </div>

        <div class="subject-card-body">
          <h3 class="subject-title">${subject.title}</h3>
          <div class="subject-instructor">
            <i class="fa-solid fa-chalkboard-user"></i>
            <span>${subject.instructor}</span>
          </div>
          <p class="subject-desc">${subject.summary}</p>

          <div class="subject-meta">
            <div class="meta-item">
              <i class="fa-solid fa-book"></i>
              <span>${totalChapters} فصول (${availableChapters} متاح)</span>
            </div>
            <div class="meta-item">
              <i class="fa-solid fa-file-pdf"></i>
              <span>ملفات PDF معتمدة</span>
            </div>
          </div>
        </div>

        <div class="subject-card-footer">
          <button class="btn btn-primary" onclick="app.openSubjectDetail('${subject.id}')">
            <i class="fa-solid fa-eye"></i> استعراض الفصول
          </button>
          <button class="btn btn-secondary" style="background-color: var(--primary-dark); color: #fff;" onclick="app.quickStartSubjectQuiz('${subject.id}')">
            <i class="fa-solid fa-pen-to-square"></i> الاختبار
          </button>
        </div>
      </div>
    `;
  }

  // ========================================================================
  // صفحة تفاصيل المقرر والفصول
  // ========================================================================
  openSubjectDetail(subjectId) {
    const subject = PLATFORM_DATA.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    this.activeSubject = subject;

    // تحديث البانر
    const banner = document.getElementById("subjectBanner");
    const breadcrumb = document.getElementById("detailSubjectBreadcrumb");
    if (breadcrumb) breadcrumb.textContent = subject.title;

    if (banner) {
      banner.innerHTML = `
        <div class="subject-banner-top">
          <span class="subject-code" style="background-color: rgba(255,255,255,0.2); color: #fff;">${subject.code}</span>
          <span style="font-size: 0.88rem; color: var(--gold);"><i class="fa-solid fa-building-columns"></i> ${subject.officialHeader}</span>
        </div>
        <h2 class="subject-banner-title">${subject.title}</h2>
        <div class="subject-banner-meta">
          <span><i class="fa-solid fa-chalkboard-user"></i> أستاذ المقرر: <strong>${subject.instructor}</strong></span>
          <span><i class="fa-solid fa-calendar-days"></i> ${subject.term}</span>
          <span><i class="fa-solid fa-layer-group"></i> الفرقة الثانية</span>
        </div>
      `;
    }

    // رندرة الفصول
    const chaptersContainer = document.getElementById("chaptersContainer");
    if (chaptersContainer) {
      chaptersContainer.innerHTML = subject.chapters.map((ch, idx) => {
        const isAvailable = (ch.status === "available");
        const statusClass = isAvailable ? "available" : "upcoming";
        const statusText = isAvailable ? "متاح للدراسة والاختبار" : "قيد الإعداد الأكاديمي";

        return `
          <div class="chapter-accordion-item">
            <div class="chapter-header" onclick="app.toggleChapterBody('ch-body-${idx}')">
              <div class="chapter-header-title">
                <div class="chapter-badge-num">${ch.number}</div>
                <div>
                  <div class="chapter-name">${ch.title}</div>
                  <div style="font-size: 0.85rem; color: var(--text-muted);">${ch.description}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="status-badge ${statusClass}">${statusText}</span>
                <i class="fa-solid fa-chevron-down" style="color: var(--text-muted);"></i>
              </div>
            </div>

            <div class="chapter-body" id="ch-body-${idx}" style="display: ${idx === 0 ? 'block' : 'none'};">
              <div class="chapter-content-grid">
                <!-- ملخص الفصل الأكاديمي -->
                <div class="content-panel">
                  <h4><i class="fa-solid fa-book-open-reader" style="color: var(--turquoise);"></i> ملخص المحاضرة والأفكار الجوهرية</h4>
                  ${ch.summaryContent}
                </div>

                <!-- المرفقات والاختبار والصوت -->
                <div class="content-panel" style="display: flex; flex-direction: column; justify-content: space-between;">
                  <div>
                    <h4><i class="fa-solid fa-paperclip" style="color: var(--orange);"></i> المواد التعليمية المرفقة</h4>

                    <!-- ملف المحاضرة PDF -->
                    ${subject.pdfFile ? `
                      <div class="resource-box">
                        <div class="resource-info">
                          <i class="fa-solid fa-file-pdf resource-icon"></i>
                          <div>
                            <div class="resource-title">شرائح المحاضرة الرسمية (PDF)</div>
                            <div class="resource-size">${subject.pdfFileSize || 'ملف PDF'}</div>
                          </div>
                        </div>
                        <a href="${subject.pdfFile}" target="_blank" download class="btn btn-outline-dark" style="padding: 6px 12px; font-size: 0.82rem;">
                          <i class="fa-solid fa-download"></i> فتح / تنزيل
                        </a>
                      </div>
                    ` : ''}

                    <!-- ملخص وبنك الأسئلة PDF إن وجد -->
                    ${subject.summaryPdfFile && subject.summaryPdfFile !== subject.pdfFile ? `
                      <div class="resource-box">
                        <div class="resource-info">
                          <i class="fa-solid fa-file-lines resource-icon" style="color: var(--turquoise);"></i>
                          <div>
                            <div class="resource-title">الملخص وبنك الأسئلة المعتمد</div>
                            <div class="resource-size">${subject.summaryPdfSize || 'ملف PDF'}</div>
                          </div>
                        </div>
                        <a href="${subject.summaryPdfFile}" target="_blank" download class="btn btn-outline-dark" style="padding: 6px 12px; font-size: 0.82rem;">
                          <i class="fa-solid fa-download"></i> فتح / تنزيل
                        </a>
                      </div>
                    ` : ''}

                    <!-- مشغل الصوت الصريح -->
                    <div class="audio-box placeholder">
                      <i class="fa-solid fa-microphone-lines" style="font-size: 1.3rem; margin-bottom: 6px; color: var(--text-muted); display: block;"></i>
                      <strong>التسجيل الصوتي:</strong> ${ch.audio.message}
                    </div>
                  </div>

                  <!-- زر بدء الاختبار -->
                  <div style="margin-top: 20px;">
                    ${ch.quizId ? `
                      <button class="btn btn-orange" style="width: 100%; padding: 14px; font-size: 1rem;" onclick="app.launchQuiz('${ch.quizId}')">
                        <i class="fa-solid fa-pen-nib"></i> بدء اختبار هذا الفصل الآن
                      </button>
                    ` : `
                      <button class="btn btn-secondary" style="width: 100%; padding: 12px; font-size: 0.9rem;" disabled>
                        <i class="fa-solid fa-lock"></i> اختبار هذا الفصل متاح قريباً
                      </button>
                    `}
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    this.showView("subject-detail");
  }

  toggleChapterBody(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.style.display = (el.style.display === "none") ? "block" : "none";
  }

  quickStartSubjectQuiz(subjectId) {
    const subject = PLATFORM_DATA.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    // البحث عن أول فصل يحتوي على اختبار متاح
    const availableChapter = subject.chapters.find(c => c.quizId);
    if (availableChapter) {
      this.launchQuiz(availableChapter.quizId);
    } else {
      alert("الاختبارات الخاصة بهذا المقرر قيد التجهيز من قبل أستاذ المادة.");
    }
  }

  // ========================================================================
  // محرك نظام الاختبارات التفاعلية (Quiz Engine)
  // ========================================================================
  launchQuiz(quizId) {
    const quiz = PLATFORM_DATA.quizzes[quizId];
    if (!quiz) {
      alert("عذراً، لم يتم العثور على الاختبار المحدد.");
      return;
    }

    this.activeQuiz = quiz;

    // تهيئة حالة الاختبار
    this.activeQuizState = {
      studentInfo: null,
      currentQuestionIndex: 0,
      answers: {},
      timerInterval: null,
      secondsElapsed: 0,
      totalSeconds: quiz.timeMinutes * 60,
      isSubmitted: false
    };

    // تحديث عناوين الواجهة
    const headerTitle = document.getElementById("quizHeaderTitle");
    const breadcrumb = document.getElementById("quizBreadcrumb");
    if (headerTitle) headerTitle.textContent = quiz.title;
    if (breadcrumb) breadcrumb.textContent = quiz.title;

    // إظهار استمارة التسجيل وإخفاء الأسئلة والنتائج
    document.getElementById("quizRegistrationForm").style.display = "block";
    document.getElementById("quizActiveContainer").style.display = "none";
    document.getElementById("quizResultsContainer").style.display = "none";

    // عرض شاشة الاختبار
    this.showView("quiz");
  }

  startQuizExecution(event) {
    event.preventDefault();

    const nameInput = document.getElementById("studentNameInput");
    const yearSelect = document.getElementById("studentYearSelect");
    const specSelect = document.getElementById("studentSpecSelect");

    const studentName = nameInput ? nameInput.value.trim() : "";
    if (!studentName) {
      alert("برجاء إدخال اسم الطالب كاملاً لبدء الاختبار.");
      return;
    }

    this.activeQuizState.studentInfo = {
      name: studentName,
      year: yearSelect ? yearSelect.value : "الفرقة الثانية",
      specialization: specSelect ? specSelect.value : "قسم نظم التجارة الإلكترونية",
      startTime: new Date().toISOString()
    };

    // إخفاء استمارة التسجيل وإظهار حاوية الأسئلة
    document.getElementById("quizRegistrationForm").style.display = "none";
    document.getElementById("quizActiveContainer").style.display = "block";

    // بدء المؤقت وعرض أول سؤال
    this.startQuizTimer();
    this.renderQuizQuestion(0);
  }

  startQuizTimer() {
    if (this.activeQuizState.timerInterval) {
      clearInterval(this.activeQuizState.timerInterval);
    }

    const timerDisplay = document.getElementById("quizTimerDisplay");
    let remaining = this.activeQuizState.totalSeconds;

    this.activeQuizState.timerInterval = setInterval(() => {
      this.activeQuizState.secondsElapsed++;
      remaining--;

      if (remaining <= 0) {
        clearInterval(this.activeQuizState.timerInterval);
        alert("انتهى وقت الاختبار المحدد! سيتم تسليم إجاباتك الآن تلقائياً.");
        this.submitQuizFinal();
        return;
      }

      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      if (timerDisplay) {
        timerDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      }
    }, 1000);
  }

  renderQuizQuestion(index) {
    const quiz = this.activeQuiz;
    if (!quiz || !quiz.questions[index]) return;

    this.activeQuizState.currentQuestionIndex = index;
    const q = quiz.questions[index];
    const total = quiz.questions.length;

    // تحديث أرقام التقدم
    document.getElementById("currentQuestionNumber").textContent = (index + 1).toString();
    document.getElementById("totalQuestionsNumber").textContent = total.toString();

    // تحديث شريط التقدم
    const percent = ((index + 1) / total) * 100;
    document.getElementById("quizProgressBar").style.width = `${percent}%`;

    // تحديث فقاعات الأسئلة العلوية
    this.renderNavBubbles();

    // نص السؤال والمرجع
    document.getElementById("qCitationTag").innerHTML = `<i class="fa-solid fa-bookmark" style="color: var(--turquoise);"></i> المرجع: ${q.citation}`;
    document.getElementById("qQuestionText").textContent = `${index + 1}. ${q.question}`;

    // رندرة الاختيارات
    const optionsContainer = document.getElementById("qOptionsList");
    const letters = ["أ", "ب", "ج", "د"];
    const currentSelected = this.activeQuizState.answers[q.id];

    optionsContainer.innerHTML = q.options.map((opt, optIdx) => {
      const isSelected = (currentSelected === optIdx);
      return `
        <div class="option-card ${isSelected ? 'selected' : ''}" onclick="app.selectOption('${q.id}', ${optIdx})">
          <div class="option-letter">${letters[optIdx] || optIdx + 1}</div>
          <div style="flex-grow: 1;">${opt}</div>
          <div style="font-size: 1.1rem; color: ${isSelected ? 'var(--turquoise)' : '#CBD5E1'};">
            <i class="fa-${isSelected ? 'solid fa-circle-check' : 'regular fa-circle'}"></i>
          </div>
        </div>
      `;
    }).join("");

    // إدارة ظهور أزرار السابق والتالي والتسليم
    const btnPrev = document.getElementById("btnPrevQuestion");
    const btnNext = document.getElementById("btnNextQuestion");
    const btnSubmit = document.getElementById("btnSubmitQuiz");

    if (btnPrev) btnPrev.style.visibility = (index === 0) ? "hidden" : "visible";

    if (index === total - 1) {
      if (btnNext) btnNext.style.display = "none";
      if (btnSubmit) btnSubmit.style.display = "inline-flex";
    } else {
      if (btnNext) btnNext.style.display = "inline-flex";
      if (btnSubmit) btnSubmit.style.display = "none";
    }
  }

  selectOption(questionId, optionIndex) {
    this.activeQuizState.answers[questionId] = optionIndex;
    this.renderQuizQuestion(this.activeQuizState.currentQuestionIndex);
  }

  renderNavBubbles() {
    const quiz = this.activeQuiz;
    const bubblesContainer = document.getElementById("quizNavBubbles");
    if (!bubblesContainer || !quiz) return;

    bubblesContainer.innerHTML = quiz.questions.map((q, idx) => {
      const isCurrent = (idx === this.activeQuizState.currentQuestionIndex);
      const isAnswered = (this.activeQuizState.answers[q.id] !== undefined);
      let cls = "q-bubble";
      if (isCurrent) cls += " current";
      if (isAnswered) cls += " answered";

      return `<div class="${cls}" onclick="app.renderQuizQuestion(${idx})">${idx + 1}</div>`;
    }).join("");
  }

  nextQuestion() {
    const nextIdx = this.activeQuizState.currentQuestionIndex + 1;
    if (nextIdx < this.activeQuiz.questions.length) {
      this.renderQuizQuestion(nextIdx);
    }
  }

  prevQuestion() {
    const prevIdx = this.activeQuizState.currentQuestionIndex - 1;
    if (prevIdx >= 0) {
      this.renderQuizQuestion(prevIdx);
    }
  }

  submitQuizConfirm() {
    const quiz = this.activeQuiz;
    const total = quiz.questions.length;
    const answeredCount = Object.keys(this.activeQuizState.answers).length;
    const unanswered = total - answeredCount;

    if (unanswered > 0) {
      const confirmSubmit = confirm(`تنبيه: يوجد (${unanswered}) سؤال لم تجب عليه بعد.\nهل أنت متأكد من رغبتك في تسليم الاختبار الآن؟`);
      if (!confirmSubmit) return;
    } else {
      const confirmSubmit = confirm("هل أنت متأكد من مراجعة كافة إجاباتك وتسليم الاختبار النهائي؟");
      if (!confirmSubmit) return;
    }

    this.submitQuizFinal();
  }

  // ========================================================================
  // تصحيح الاختبار وحساب الدرجة وعرض النتائج
  // ========================================================================
  submitQuizFinal() {
    if (this.activeQuizState.timerInterval) {
      clearInterval(this.activeQuizState.timerInterval);
    }
    this.activeQuizState.isSubmitted = true;

    const quiz = this.activeQuiz;
    const total = quiz.questions.length;
    let correctCount = 0;

    // حساب النتيجة الدقيقة
    quiz.questions.forEach(q => {
      const studentAns = this.activeQuizState.answers[q.id];
      if (studentAns !== undefined && studentAns === q.correctIndex) {
        correctCount++;
      }
    });

    const wrongCount = total - correctCount;
    const percentage = Math.round((correctCount / total) * 100);
    const isPassed = (percentage >= quiz.passPercentage);
    const minutesSpent = Math.max(1, Math.round(this.activeQuizState.secondsElapsed / 60));

    // إعداد كائن المحاولة لتوثيقه
    const attemptRecord = {
      attemptId: "ATT-" + Date.now().toString(36).toUpperCase(),
      timestamp: new Date().toLocaleString("ar-EG"),
      isoDate: new Date().toISOString(),
      studentName: this.activeQuizState.studentInfo.name,
      academicYear: this.activeQuizState.studentInfo.year,
      specialization: this.activeQuizState.studentInfo.specialization,
      quizId: quiz.id,
      quizTitle: quiz.title,
      subjectTitle: PLATFORM_DATA.subjects.find(s => s.id === quiz.subjectId)?.title || "مقرر المعهد",
      score: correctCount,
      total: total,
      percentage: percentage,
      correctCount: correctCount,
      wrongCount: wrongCount,
      minutesSpent: minutesSpent,
      status: isPassed ? "ناجح" : "يحتاج مراجعة"
    };

    // حفظ النتيجة محلياً
    this.saveAttemptLocally(attemptRecord);

    // إخفاء منطقة الأسئلة وإظهار النتائج
    document.getElementById("quizActiveContainer").style.display = "none";
    document.getElementById("quizResultsContainer").style.display = "block";

    // تعبئة عناصر واجهة النتيجة
    document.getElementById("resultScoreValue").textContent = `${correctCount}/${total}`;
    document.getElementById("resultPercentValue").textContent = `${percentage}%`;

    const circleWrapper = document.getElementById("scoreCircleWrapper");
    if (circleWrapper) {
      circleWrapper.style.setProperty("--percentage", `${percentage}%`);
    }

    const titleElem = document.getElementById("resultStatusTitle");
    const encouragementElem = document.getElementById("resultEncouragementText");

    if (isPassed) {
      if (titleElem) {
        titleElem.textContent = "تهانينا! لقد اجتزت الاختبار بنجاح 🎓";
        titleElem.className = "result-status-title pass";
      }
      if (encouragementElem) {
        encouragementElem.textContent = `أحسنت يا ${attemptRecord.studentName}! أداؤك يعكس استيعاباً ممتازاً لأفكار المقرر ومحاضرات المعهد. استمر في هذا التفوق الأكاديمي.`;
      }
    } else {
      if (titleElem) {
        titleElem.textContent = "محاولة تدريبية مقبولة — يمكنك تحسين درجتك";
        titleElem.className = "result-status-title retry";
      }
      if (encouragementElem) {
        encouragementElem.textContent = `لا بأس يا ${attemptRecord.studentName}، هذه فرصة ممتازة للمراجعة. راجع تفسير الأسئلة أدناه وأعد قراءة الملخص، ثم أعد المحاولة للوصول إلى الإتقان الكامل.`;
      }
    }

    document.getElementById("statCorrectCount").textContent = correctCount.toString();
    document.getElementById("statWrongCount").textContent = wrongCount.toString();
    document.getElementById("statTimeSpent").textContent = `${minutesSpent} دقيقة`;

    // رندرة بطاقات المراجعة التفصيلية والتفسيرات
    this.renderQuizReview(quiz);

    // محاولة الإرسال المركزي للسيرفر (Google Apps Script / Sheets)
    this.syncAttemptToCentralServer(attemptRecord);

    // تحديث العدادات العامة ولوحة الأدمن
    this.updateStatsCounters();
  }

  renderQuizReview(quiz) {
    const container = document.getElementById("quizReviewCardsContainer");
    if (!container) return;

    container.innerHTML = quiz.questions.map((q, idx) => {
      const studentAns = this.activeQuizState.answers[q.id];
      const isCorrect = (studentAns !== undefined && studentAns === q.correctIndex);
      const studentAnsText = (studentAns !== undefined) ? q.options[studentAns] : "<span style='color: var(--danger);'>لم تتم الإجابة</span>";
      const correctAnsText = q.options[q.correctIndex];

      return `
        <div class="review-card ${isCorrect ? 'correct' : 'incorrect'}">
          <div class="review-q-header">
            <span><strong>السؤال ${idx + 1}</strong> (${q.type === 'mcq' ? 'اختيار من متعدد' : 'صح أو خطأ'})</span>
            <span style="color: ${isCorrect ? 'var(--success)' : 'var(--danger)'};">
              <i class="fa-solid ${isCorrect ? 'fa-check' : 'fa-xmark'}"></i> ${isCorrect ? 'إجابة صحيحة' : 'إجابة خاطئة'}
            </span>
          </div>

          <div class="review-q-text">${q.question}</div>

          <div class="review-answers-grid">
            <div style="background: #ffffff; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
              <span style="font-size: 0.78rem; color: var(--text-muted); display: block;">إجابتك:</span>
              <strong>${studentAnsText}</strong>
            </div>
            <div style="background: var(--success-bg); padding: 10px; border-radius: 6px; border: 1px solid #A7F3D0;">
              <span style="font-size: 0.78rem; color: #065F46; display: block;">الإجابة الصحيحة المعتمدة:</span>
              <strong style="color: #065F46;">${correctAnsText}</strong>
            </div>
          </div>

          <div class="review-explanation">
            <strong><i class="fa-solid fa-lightbulb" style="color: var(--gold);"></i> التفسير الأكاديمي:</strong> ${q.explanation}<br />
            <span style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px; display: inline-block;">
              <i class="fa-solid fa-book-bookmark"></i> <strong>المرجع:</strong> ${q.citation}
            </span>
          </div>
        </div>
      `;
    }).join("");
  }

  restartActiveQuiz() {
    if (this.activeQuiz) {
      this.launchQuiz(this.activeQuiz.id);
    }
  }

  // ========================================================================
  // حفظ النتائج والتكامل المركزي (Google Apps Script / Sheets)
  // ========================================================================
  saveAttemptLocally(record) {
    const attempts = JSON.parse(localStorage.getItem("halqa_attempts") || "[]");
    attempts.unshift(record);
    localStorage.setItem("halqa_attempts", JSON.stringify(attempts));
  }

  async syncAttemptToCentralServer(record) {
    const banner = document.getElementById("saveStatusBanner");
    const scriptUrl = this.appsScriptEndpoint;

    if (!scriptUrl) {
      // إشعار صادق بدون مواربة: تم الحفظ محلياً لأن صاحب المشروع لم يربط الـ URL بعد
      if (banner) {
        banner.className = "save-status-banner local-only";
        banner.innerHTML = `
          <i class="fa-solid fa-circle-check"></i>
          <span><strong>تم حفظ النتيجة محلياً بنجاح في متصفحك.</strong> (الربط بالسجل المركزي لـ Google Sheets يتطلب وضع رابط Web App الخاص بـ Apps Script).</span>
        `;
      }
      return;
    }

    try {
      if (banner) {
        banner.className = "save-status-banner saving";
        banner.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جارٍ إرسال النتيجة إلى السجل المركزي السحابي للمعهد...`;
      }

      // إرسال عبر fetch POST متوافق مع Apps Script
      const response = await fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors", // نظراً لقيود CORS في Google Apps Script Web App
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });

      // في وضع no-cors لا نصل لنص الرد، لكن عدم حدوث Exception يعني وصول الطلب
      if (banner) {
        banner.className = "save-status-banner saved";
        banner.innerHTML = `
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span><strong>تم إرسال وحفظ النتيجة في السجل المركزي لمعهد نظم التجارة الإلكترونية بسوهاج.</strong></span>
        `;
      }
    } catch (err) {
      console.warn("تعذر الاتصال بالسيرفر السحابي:", err);
      if (banner) {
        banner.className = "save-status-banner local-only";
        banner.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>تعذر الاتصال بالسيرفر المركزي، تم حفظ النتيجة محلياً على جهازك لضمان عدم ضياع درجتك.</span>
        `;
      }
    }
  }

  // ========================================================================
  // تصدير النتائج إلى Excel / CSV متوافق 100% مع اللغة العربية
  // ========================================================================
  exportStudentResultCSV() {
    const attempts = JSON.parse(localStorage.getItem("halqa_attempts") || "[]");
    if (attempts.length === 0) {
      alert("لا توجد نتائج مسجلة للتصدير حالياً.");
      return;
    }

    const latest = attempts[0];
    const headers = ["رقم المحاولة", "التاريخ والوقت", "اسم الطالب", "الفرقة الدراسية", "التخصص", "المادة", "الدرجة", "من إجمالي", "النسبة المئوية", "الحالة"];
    const row = [
      latest.attemptId,
      `"${latest.timestamp}"`,
      `"${latest.studentName}"`,
      `"${latest.academicYear}"`,
      `"${latest.specialization}"`,
      `"${latest.subjectTitle} - ${latest.quizTitle}"`,
      latest.score,
      latest.total,
      `"${latest.percentage}%"`,
      `"${latest.status}"`
    ];

    const csvContent = "\uFEFF" + headers.join(",") + "\n" + row.join(",");
    this.downloadCSVFile(csvContent, `نتيجة_${latest.studentName}_${latest.attemptId}.csv`);
  }

  exportAllAttemptsCSV() {
    const attempts = JSON.parse(localStorage.getItem("halqa_attempts") || "[]");
    if (attempts.length === 0) {
      alert("سجل النتائج فارغ حتى الآن.");
      return;
    }

    const headers = ["رقم المحاولة", "التاريخ والوقت", "اسم الطالب", "الفرقة", "التخصص", "المادة والاختبار", "الدرجة المحققة", "الدرجة العظمى", "النسبة المئوية", "الإجابات الصحيحة", "الإجابات الخاطئة", "زمن الإجابة (دقائق)", "الحالة"];
    const rows = attempts.map(a => [
      a.attemptId,
      `"${a.timestamp}"`,
      `"${a.studentName}"`,
      `"${a.academicYear}"`,
      `"${a.specialization}"`,
      `"${a.subjectTitle} - ${a.quizTitle}"`,
      a.score,
      a.total,
      `"${a.percentage}%"`,
      a.correctCount,
      a.wrongCount,
      a.minutesSpent,
      `"${a.status}"`
    ].join(","));

    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    this.downloadCSVFile(csvContent, `سجل_نتائج_طلاب_حلقة_وصل_${Date.now()}.csv`);
  }

  downloadCSVFile(content, fileName) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ========================================================================
  // لوحة المسؤول المركزي (Admin Dashboard)
  // ========================================================================
  renderAdminAttemptsTable() {
    const attempts = JSON.parse(localStorage.getItem("halqa_attempts") || "[]");
    const searchInput = document.getElementById("adminSearchInput");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filtered = attempts.filter(a => {
      if (!query) return true;
      return (
        a.studentName.toLowerCase().includes(query) ||
        a.subjectTitle.toLowerCase().includes(query) ||
        a.quizTitle.toLowerCase().includes(query)
      );
    });

    // تحديث بطاقات الـ KPIs
    const totalAttempts = attempts.length;
    const avgScore = totalAttempts > 0 
      ? Math.round(attempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts) 
      : 0;
    const passedCount = attempts.filter(a => a.percentage >= 60).length;
    const passRate = totalAttempts > 0 ? Math.round((passedCount / totalAttempts) * 100) : 0;

    const totalEl = document.getElementById("adminKpiTotalAttempts");
    const avgEl = document.getElementById("adminKpiAverageScore");
    const passEl = document.getElementById("adminKpiPassRate");

    if (totalEl) totalEl.textContent = totalAttempts.toString();
    if (avgEl) avgEl.textContent = `${avgScore}%`;
    if (passEl) passEl.textContent = `${passRate}%`;

    // ملء الجدول
    const tbody = document.getElementById("adminAttemptsTableBody");
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">
            <i class="fa-regular fa-folder-open" style="font-size: 1.8rem; display: block; margin-bottom: 8px;"></i>
            لا توجد محاولات مسجلة مطابقة حتى الآن. قم بإجراء اختبار تجريبي وستظهر نتيجته فوراً هنا.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((a, idx) => `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${a.timestamp}</span></td>
        <td><strong>${a.studentName}</strong></td>
        <td>${a.academicYear}</td>
        <td><span style="font-size: 0.82rem;">${a.specialization}</span></td>
        <td>${a.subjectTitle}</td>
        <td><strong>${a.score} / ${a.total}</strong></td>
        <td><span class="badge-score ${a.percentage >= 60 ? 'high' : 'low'}">${a.percentage}%</span></td>
        <td>${a.status}</td>
      </tr>
    `).join("");
  }

  clearAttemptsDataConfirm() {
    const confirmClear = confirm("هل تريد بالتأكيد تصفير سجل نتائج الاختبارات المحلي؟\n(لن تتأثر النتائج المسجلة في Google Sheets إن وجدت).");
    if (confirmClear) {
      localStorage.setItem("halqa_attempts", JSON.stringify([]));
      this.renderAdminAttemptsTable();
      this.updateStatsCounters();
      alert("تم تصفير السجل التجريبي بنجاح.");
    }
  }

  // ========================================================================
  // المساعد التعليمي الذكي (AI Educational Assistant)
  // ========================================================================
  handleAiSendMessage() {
    const input = document.getElementById("aiUserInput");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // إضافة رسالة الطالب للشات
    this.appendChatMessage(text, "user");
    input.value = "";

    // معالجة الرد
    setTimeout(() => {
      this.processAiQuery(text);
    }, 400);
  }

  sendAiPrompt(promptText) {
    this.appendChatMessage(promptText, "user");
    setTimeout(() => {
      this.processAiQuery(promptText);
    }, 300);
  }

  appendChatMessage(message, sender) {
    const windowEl = document.getElementById("aiChatWindow");
    if (!windowEl) return;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = message;
    windowEl.appendChild(bubble);
    windowEl.scrollTop = windowEl.scrollHeight;
  }

  processAiQuery(query) {
    const normalized = query.toLowerCase();

    // فحص طلب سؤال تدريبي
    if (normalized.includes("سؤال") || normalized.includes("اختبرني") || normalized.includes("تدريب")) {
      this.generateAiPracticeQuestion();
      return;
    }

    // البحث في قاعدة المعرفة المحلية المعتمدة
    let matchedItem = null;
    for (const item of PLATFORM_DATA.localKnowledgeBase) {
      for (const kw of item.keywords) {
        if (normalized.includes(kw)) {
          matchedItem = item;
          break;
        }
      }
      if (matchedItem) break;
    }

    if (matchedItem) {
      this.appendChatMessage(`
        <strong><i class="fa-solid fa-graduation-cap" style="color: var(--turquoise);"></i> إجابة من مقرر المعهد:</strong><br />
        ${matchedItem.response}
      `, "bot");
    } else {
      this.appendChatMessage(`
        أهلاً بك! بصفتي المساعد الأكاديمي لمقررات الفرقة الثانية بمعهد نظم التجارة الإلكترونية، تم تدريبي على الموضوعات المحددة في المحاضرات المعتمدة:
        <ul style="padding-right: 20px; margin-top: 8px;">
          <li><strong>مقرر تحليلات الأعمال (د. شيرين السيد عبدالله):</strong> مفهوم التحليل، أدوار محلل الأعمال، وفوائد التحليلات.</li>
          <li><strong>مقرر إدارة اللوجستيات:</strong> أصل الكلمة، أهداف اللوجستيات، وسلسلة الإمداد.</li>
          <li><strong>المحاسبة المالية:</strong> قيود اليومية، إعداد قائمة الدخل وقائمة المركز المالي.</li>
        </ul>
        جرّب سؤالي عن أي من هذه المفاهيم أو اضغط على الأزرار السريعة بالأعلى!
      `, "bot");
    }
  }

  generateAiPracticeQuestion() {
    const quizKeys = Object.keys(PLATFORM_DATA.quizzes);
    const randomQuiz = PLATFORM_DATA.quizzes[quizKeys[Math.floor(Math.random() * quizKeys.length)]];
    const randomQ = randomQuiz.questions[Math.floor(Math.random() * randomQuiz.questions.length)];

    const optionsHtml = randomQ.options.map((opt, i) => `<li>${opt}</li>`).join("");

    this.appendChatMessage(`
      <strong><i class="fa-solid fa-circle-question" style="color: var(--gold);"></i> سؤال تدريبي سريع من ${randomQuiz.title}:</strong><br /><br />
      <strong>${randomQ.question}</strong>
      <ol style="padding-right: 20px; margin: 8px 0;">${optionsHtml}</ol>
      <div style="font-size: 0.84rem; color: var(--text-muted); margin-top: 8px;">
        💡 <strong>الإجابة الصحيحة:</strong> ${randomQ.options[randomQ.correctIndex]}<br />
        <em>${randomQ.explanation}</em>
      </div>
    `, "bot");
  }

  openAiConfigModal() {
    const currentUrl = this.appsScriptEndpoint;
    const newUrl = prompt("أدخل رابط Google Apps Script Web App لحفظ النتائج سحابياً:", currentUrl);
    if (newUrl !== null) {
      this.appsScriptEndpoint = newUrl.trim();
      localStorage.setItem("halqa_apps_script_url", this.appsScriptEndpoint);
      alert("تم حفظ رابط السيرفر السحابي بنجاح.");
    }
  }

  // ========================================================================
  // تحديث عدادات الإحصاءات العامة
  // ========================================================================
  updateStatsCounters() {
    const attempts = JSON.parse(localStorage.getItem("halqa_attempts") || "[]");
    const statAttemptsElem = document.getElementById("statAttemptsCount");
    if (statAttemptsElem) {
      statAttemptsElem.textContent = attempts.length.toLocaleString("ar-EG");
    }

    const totalQuestions = Object.values(PLATFORM_DATA.quizzes).reduce((sum, q) => sum + q.questions.length, 0);
    const statQuestionsElem = document.getElementById("statQuestionsCount");
    if (statQuestionsElem) {
      statQuestionsElem.textContent = totalQuestions.toLocaleString("ar-EG");
    }

    const statSubjectsElem = document.getElementById("statSubjectsCount");
    if (statSubjectsElem) {
      statSubjectsElem.textContent = PLATFORM_DATA.subjects.length.toLocaleString("ar-EG");
    }
  }
}

// إنشاء النسخة العامة للتطبيق وتفعيلها فور اكتمال تحميل DOM
const app = new HalqaWaslApp();
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
