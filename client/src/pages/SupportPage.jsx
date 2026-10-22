const englishFaqs = [
  [
    "I can’t sign in. What should I try?",
    <>Check that you are using the username and password for your account. If you forgot your password, choose <strong>Forgot password?</strong> on the sign-in screen and follow the instructions sent to your account email. Check your internet connection and try again.</>,
  ],
  [
    "I signed in, but I can’t see a course.",
    <>Make sure you signed in with the account that was given access to the course. If it is still missing, ask the instructor or account administrator who provided your login to check your course access.</>,
  ],
  [
    "The app says this device is not authorized.",
    <>Your account may be linked to a different device. Ask the account administrator who provided your login to review or reset the authorized device for your account.</>,
  ],
  [
    "A video or document will not open.",
    <>Check that your internet connection is stable, close and reopen the lesson, and make sure you are using the latest app version. If the problem continues, note the course and lesson name when you ask for help.</>,
  ],
  [
    "I’m having trouble during a quiz or assignment.",
    <>Keep the app open while working and check your connection. If an assessment has closed or your submission is missing, contact the instructor through your usual course channel and include the course and assessment name.</>,
  ],
];

const arabicFaqs = [
  [
    "لا أستطيع تسجيل الدخول. ماذا أفعل؟",
    <>تأكد من استخدام اسم المستخدم وكلمة المرور الخاصة بحسابك. إذا نسيت كلمة المرور، اختر <strong>«نسيت كلمة المرور؟»</strong> في شاشة الدخول واتبع التعليمات المرسلة إلى بريد حسابك. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.</>,
  ],
  [
    "سجلت الدخول، لكنني لا أرى المقرر.",
    <>تأكد من تسجيل الدخول بالحساب الذي مُنح صلاحية الوصول إلى المقرر. إذا لم يظهر المقرر، تواصل مع المدرّس أو مسؤول الحساب الذي زوّدك ببيانات الدخول للتحقق من صلاحية الوصول.</>,
  ],
  [
    "تظهر رسالة بأن هذا الجهاز غير مصرح به.",
    <>قد يكون حسابك مرتبطًا بجهاز آخر. اطلب من مسؤول الحساب الذي زوّدك ببيانات الدخول مراجعة الجهاز المصرح به لحسابك أو إعادة ضبطه.</>,
  ],
  [
    "لا يفتح الفيديو أو المستند.",
    <>تحقق من استقرار اتصال الإنترنت، ثم أغلق الدرس وافتحه مجددًا، وتأكد من استخدام أحدث إصدار من التطبيق. إذا استمرت المشكلة، اذكر اسم المقرر والدرس عند طلب المساعدة.</>,
  ],
  [
    "أواجه مشكلة أثناء اختبار أو واجب.",
    <>أبقِ التطبيق مفتوحًا أثناء العمل وتحقق من اتصال الإنترنت. إذا انتهى وقت التقييم أو لم يظهر التسليم، تواصل مع المدرّس عبر قناة المقرر المعتادة واذكر اسم المقرر والتقييم.</>,
  ],
];

function FaqList({ items }) {
  return (
    <div className="mt-5 space-y-3">
      {items.map(([question, answer]) => (
        <details key={question} className="group rounded-xl border border-surface-200 bg-white open:border-brand-200 dark:border-surface-700 dark:bg-surface-900">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold leading-6 text-surface-900 marker:hidden dark:text-white">
            {question}
          </summary>
          <div className="border-t border-surface-100 px-5 py-4 text-sm leading-7 text-surface-700 dark:border-surface-800 dark:text-surface-300">
            {answer}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-surface-50 px-4 py-8 text-surface-900 dark:bg-surface-950 dark:text-white sm:py-12">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <header className="border-t-4 border-gold-500 bg-brand-900 px-6 py-8 text-white sm:px-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold-300">Feker · Help Center</p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">How can we help?</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-100">
            Find quick help for signing in, opening courses, watching lessons, and completing quizzes.
          </p>
          <nav className="mt-5 flex gap-5 text-sm font-semibold" aria-label="Choose language">
            <a className="text-white underline underline-offset-4" href="#english">English</a>
            <a className="text-white underline underline-offset-4" href="#arabic" lang="ar" dir="rtl">العربية</a>
          </nav>
        </header>

        <div className="space-y-10 px-6 py-8 sm:px-10">
          <section id="english" lang="en">
            <h2 className="text-xl font-bold text-brand-900 dark:text-white">Common questions</h2>
            <FaqList items={englishFaqs} />
            <aside className="mt-6 rounded-xl border-s-4 border-gold-500 bg-gold-50 p-5 text-sm leading-7 text-surface-700 dark:bg-surface-800 dark:text-surface-200">
              <h3 className="font-bold text-brand-900 dark:text-white">Still need help?</h3>
              <p className="mt-2">For account access or course-specific questions, contact the instructor or account administrator who provided your login.</p>
              <p className="mt-2">Include your device model, app version if available, what you were trying to do, and the exact error message. <strong>Never send your password or verification code.</strong></p>
            </aside>
          </section>

          <section id="arabic" lang="ar" dir="rtl" className="border-t border-surface-200 pt-8 dark:border-surface-700">
            <h2 className="text-xl font-bold text-brand-900 dark:text-white">الأسئلة الشائعة</h2>
            <FaqList items={arabicFaqs} />
            <aside className="mt-6 rounded-xl border-s-4 border-gold-500 bg-gold-50 p-5 text-sm leading-8 text-surface-700 dark:bg-surface-800 dark:text-surface-200">
              <h3 className="font-bold text-brand-900 dark:text-white">هل ما زلت بحاجة إلى مساعدة؟</h3>
              <p className="mt-2">للمساعدة في الدخول إلى الحساب أو في موضوع متعلق بمقرر، تواصل مع المدرّس أو مسؤول الحساب الذي زوّدك ببيانات الدخول.</p>
              <p className="mt-2">اذكر نوع جهازك وإصدار التطبيق إن توفر، وما الذي كنت تحاول فعله، ونص رسالة الخطأ. <strong>لا ترسل كلمة المرور أو رمز التحقق أبدًا.</strong></p>
            </aside>
          </section>

          <footer className="border-t border-surface-200 pt-5 text-sm font-semibold dark:border-surface-700">
            <a className="text-brand-700 underline underline-offset-4 dark:text-brand-300" href="/login">Open sign in</a>
          </footer>
        </div>
      </div>
    </main>
  );
}
