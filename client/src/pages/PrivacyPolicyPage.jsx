const policyDate = 'November 8, 2026';

function Section({ title, children }) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-bold text-brand-900 dark:text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-surface-700 dark:text-surface-300">{children}</div>
    </section>
  );
}

function DataList({ items }) {
  return (
    <ul className="list-disc space-y-2 ps-6">
      {items.map(([label, detail]) => (
        <li key={label}><strong className="text-surface-900 dark:text-white">{label}</strong> {detail}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-surface-50 px-4 py-8 text-surface-900 dark:bg-surface-950 dark:text-white sm:py-12">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <header className="border-t-4 border-gold-500 px-6 py-8 sm:px-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300"><bdi dir="ltr">Feker/ فكر</bdi></p>
          <h1 className="mt-3 text-3xl font-extrabold text-brand-950 dark:text-white sm:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">Last updated: {policyDate}</p>
          <nav className="mt-5 flex gap-5 text-sm font-semibold" aria-label="Policy languages">
            <a className="text-brand-700 underline underline-offset-4 dark:text-brand-300" href="#english">English</a>
            <a className="text-brand-700 underline underline-offset-4 dark:text-brand-300" href="#arabic" lang="ar" dir="rtl">العربية</a>
          </nav>
          <p className="mt-5 rounded-lg border-s-4 border-gold-500 bg-gold-50 p-4 text-sm leading-6 text-surface-700 dark:bg-surface-800 dark:text-surface-200">
            This privacy policy applies to <bdi dir="ltr">Feker/ فكر</bdi> (<bdi dir="ltr">com.alahliyya.lms</bdi>), published on Google Play under the developer name <bdi dir="ltr">VortexMind</bdi>. It also covers the learning website at students-alahliyaa.com.
          </p>
        </header>

        <div className="px-6 pb-10 sm:px-10">
          <article id="english" lang="en">
            <Section title="1. About the platform">
              <p><bdi dir="ltr">Feker/ فكر</bdi> is an online learning platform for students and instructors. The Android app is developed by Mustafa ALRefaee. “We” refers to the team that operates and supports the platform.</p>
              <p>For privacy questions or requests about your personal data, email <a href="mailto:atoofeh8@gmail.com">atoofeh8@gmail.com</a>.</p>
            </Section>

            <Section title="2. Information we process">
              <DataList items={[
                ['Account information:', 'name, username, email address, account role and status, profile image, and password credentials. Passwords are stored in a protected, hashed form.'],
                ['Learning records:', 'course enrollment, lesson activity and progress, quiz answers and results, assignment submissions and attachments, grades and feedback, course questions and replies, bookmarks, and certificates.'],
                ['Files and course material:', 'documents, images, videos, and other material uploaded by students or instructors.'],
                ['Device and security information:', 'IP address, browser and operating system details, app version, a pseudonymous device identifier, and a device fingerprint derived from browser and device characteristics. We also keep sign-in, session, and security or audit records. An IP address may indicate an approximate region; the app does not request precise GPS location.'],
                ['Quiz integrity signals:', 'during protected quizzes, the platform may record events such as leaving the quiz screen, changing tabs or windows, copy/paste attempts, leaving full screen, inactivity, refreshes, and network interruptions. Supported devices may report a screen-capture event; the platform does not receive a captured image through this feature.'],
                ['Preferences and notifications:', 'language and theme preferences, notification settings, and—if Android notification permission is granted and push notifications are configured—a device push token used to deliver them.'],
              ]} />
            </Section>

            <Section title="3. How we use information">
              <p>We use information to create and secure accounts; provide courses, lessons, assessments, grades, certificates, and support; keep learning progress; send service notifications; administer the platform; investigate misuse and protect quiz integrity; and meet applicable requirements. Instructors and authorized platform staff may use learning activity to teach, grade, and support students.</p>
            </Section>

            <Section title="4. When information is shared">
              <DataList items={[
                ['Instructors and platform staff:', 'authorized people can access learning records needed for teaching, grading, administration, and support.'],
                ['Service providers:', 'providers may process information for platform hosting, database and file storage, email delivery, and technical operations. Google Firebase Cloud Messaging may process a push token and notification data when push notifications are enabled.'],
                ['Legal and safety reasons:', 'information may be disclosed when required by law or needed to protect users or the security of the service.'],
              ]} />
              <p>We do not sell personal information, serve advertising in the app, or use the Android advertising ID for ad tracking.</p>
            </Section>

            <Section title="5. Cookies and device storage">
              <p>On the website, an HttpOnly cookie keeps your session signed in; local browser storage keeps preferences, a cached profile, and a pseudonymous device identifier. Quiz answers may be kept in temporary session storage so you can recover them while taking a quiz. On Android, refresh credentials are held in app memory or encrypted device storage, depending on the “Remember me” choice. Theme and language preferences are stored on your device. These technologies support the service and are not used for advertising.</p>
            </Section>

            <Section title="6. Retention">
              <p>We retain information for as long as needed to operate the platform, maintain learning records, provide support, protect account security, and meet applicable requirements. Some learning, audit, or security records may be retained after an account is disabled or deleted.</p>
            </Section>

            <Section title="7. Security">
              <p>We use access controls and technical safeguards designed to protect information. Connections to the service use HTTPS, and video media is encrypted at rest. No internet service can guarantee absolute security.</p>
            </Section>

            <Section title="8. Your choices">
              <p>You can update profile and preference details that are available in the platform. Some learning, audit, or security records may need to be retained for operational or legal reasons.</p>
            </Section>

            <Section title="9. Changes to this policy">
              <p>We may update this policy when the platform or its practices change. The latest version and its effective date will be posted on this page.</p>
            </Section>
          </article>

          <article id="arabic" lang="ar" dir="rtl" className="mt-12 border-t border-surface-200 pt-9 dark:border-surface-700">
            <h1 className="text-3xl font-extrabold text-brand-950 dark:text-white">سياسة الخصوصية</h1>
            <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">آخر تحديث: 8 تشرين الثاني 2026</p>
            <p className="mt-5 rounded-lg border-s-4 border-gold-500 bg-gold-50 p-4 text-sm leading-6 text-surface-700 dark:bg-surface-800 dark:text-surface-200">
              تسري سياسة الخصوصية هذه على تطبيق <bdi dir="ltr">Feker/ فكر</bdi> (<bdi dir="ltr">com.alahliyya.lms</bdi>)، المنشور على متجر Google Play باسم المطوّر <bdi dir="ltr">VortexMind</bdi>، كما تشمل موقع التعلّم <bdi dir="ltr">students-alahliyaa.com</bdi>.
            </p>

            <Section title="1. حول المنصة">
              <p><bdi dir="ltr">Feker/ فكر</bdi> منصة تعليمية عبر الإنترنت للطلبة والمدرسين. مطوّر تطبيق أندرويد هو <bdi dir="ltr">Mustafa ALRefaee</bdi>. ويُقصد بعبارة «نحن» الفريق الذي يدير المنصة ويقدّم الدعم لها.</p>
              <p>للاستفسارات المتعلقة بالخصوصية أو لتقديم طلب يخص بياناتك الشخصية، راسلنا على <a href="mailto:atoofeh8@gmail.com"><bdi dir="ltr">atoofeh8@gmail.com</bdi></a>.</p>
            </Section>

            <Section title="2. المعلومات التي نعالجها">
              <DataList items={[
                ['معلومات الحساب:', 'الاسم واسم المستخدم والبريد الإلكتروني ودور الحساب وحالته والصورة الشخصية وبيانات كلمة المرور. تُحفظ كلمات المرور بصيغة محمية ومجزأة.'],
                ['السجلات التعليمية:', 'التسجيل في المساقات ونشاط الدروس والتقدم فيها وإجابات الاختبارات ونتائجها وتسليمات الواجبات ومرفقاتها والعلامات وملاحظات التصحيح والأسئلة والردود والمحفوظات والشهادات.'],
                ['الملفات والمواد التعليمية:', 'المستندات والصور ومقاطع الفيديو والمواد الأخرى التي يرفعها الطلبة أو المدرسون.'],
                ['معلومات الجهاز والأمان:', 'عنوان IP ومعلومات المتصفح ونظام التشغيل وإصدار التطبيق ومعرّف جهاز مستعار وبصمة جهاز مشتقة من خصائص المتصفح والجهاز. كما نحتفظ بسجلات الدخول والجلسات وأحداث الأمان والتدقيق. وقد يشير عنوان IP إلى منطقة جغرافية تقريبية؛ ولا يطلب التطبيق الموقع الدقيق عبر GPS.'],
                ['مؤشرات نزاهة الاختبارات:', 'أثناء الاختبارات المحمية، قد تسجل المنصة أحداثاً مثل مغادرة شاشة الاختبار أو تبديل علامات التبويب أو النوافذ ومحاولات النسخ أو اللصق والخروج من وضع ملء الشاشة والخمول وإعادة تحميل الصفحة وانقطاع الشبكة. وقد تبلغ بعض الأجهزة عن حدث التقاط الشاشة؛ ولا تستقبل المنصة صورة ملتقطة من خلال هذه الميزة.'],
                ['التفضيلات والإشعارات:', 'تفضيلات اللغة والمظهر وإعدادات الإشعارات، ومعرّف إشعارات الجهاز عند منح إذن إشعارات Android وإعداد خدمة الإشعارات الفورية.'],
              ]} />
            </Section>

            <Section title="3. كيفية استخدام المعلومات">
              <p>نستخدم المعلومات لإنشاء الحسابات وحمايتها، وتقديم المساقات والدروس والتقييمات والعلامات والشهادات والدعم، وحفظ التقدم التعليمي، وإرسال إشعارات الخدمة، وإدارة المنصة، والتحقق من إساءة الاستخدام وحماية نزاهة الاختبارات، والوفاء بالمتطلبات المعمول بها. وقد يستخدم المدرسون وأعضاء فريق المنصة المخولون النشاط التعليمي للتدريس والتصحيح ودعم الطلبة.</p>
            </Section>

            <Section title="4. مشاركة المعلومات">
              <DataList items={[
                ['المدرسون وفريق المنصة:', 'يمكن للأشخاص المخولين الوصول إلى السجلات التعليمية اللازمة للتدريس والتصحيح والإدارة والدعم.'],
                ['مقدمو الخدمات:', 'قد يعالج مقدمو الخدمات المعلومات لاستضافة المنصة وتخزين قواعد البيانات والملفات وإرسال البريد الإلكتروني والتشغيل التقني. وقد تعالج خدمة Google Firebase Cloud Messaging معرّف الإشعارات وبيانات الإشعار عند تفعيل الإشعارات.'],
                ['المتطلبات القانونية والأمان:', 'قد نكشف عن المعلومات إذا أوجب القانون ذلك أو عند الحاجة لحماية المستخدمين أو أمان الخدمة.'],
              ]} />
              <p>لا نبيع المعلومات الشخصية ولا نعرض إعلانات في التطبيق ولا نستخدم معرّف Android الإعلاني لتتبع الإعلانات.</p>
            </Section>

            <Section title="5. ملفات الارتباط والتخزين على الجهاز">
              <p>يستخدم الموقع ملف تعريف ارتباط HttpOnly لإبقاء الجلسة مسجلة الدخول، كما يحفظ المتصفح التفضيلات ونسخة مؤقتة من الملف الشخصي ومعرّف جهاز مستعار. وقد تُحفظ إجابات الاختبار مؤقتاً في مساحة تخزين الجلسة لاستعادتها أثناء الاختبار. وعلى Android، تُحفظ بيانات تجديد الجلسة في ذاكرة التطبيق أو في تخزين مشفر على الجهاز وفق خيار «تذكرني». كما تُحفظ تفضيلات المظهر واللغة على الجهاز. تدعم هذه التقنيات الخدمة ولا تُستخدم للإعلانات.</p>
            </Section>

            <Section title="6. الاحتفاظ بالمعلومات">
              <p>نحتفظ بالمعلومات للمدة اللازمة لتشغيل المنصة وحفظ السجلات التعليمية وتقديم الدعم وحماية الحسابات والوفاء بالمتطلبات المعمول بها. وقد نحتفظ ببعض السجلات التعليمية أو سجلات التدقيق والأمان بعد تعطيل الحساب أو حذفه.</p>
            </Section>

            <Section title="7. الأمان">
              <p>نستخدم ضوابط وصول وتدابير تقنية تهدف إلى حماية المعلومات. وتستخدم الاتصالات بالمنصة بروتوكول HTTPS، كما تُشفّر ملفات الفيديو عند تخزينها. ولا يمكن لأي خدمة عبر الإنترنت ضمان الأمان المطلق.</p>
            </Section>

            <Section title="8. خياراتك">
              <p>يمكنك تحديث بيانات الملف الشخصي والتفضيلات المتاحة في المنصة. وقد يلزم الاحتفاظ ببعض السجلات التعليمية أو سجلات التدقيق والأمان لأسباب تشغيلية أو قانونية.</p>
            </Section>

            <Section title="9. التعديلات على هذه السياسة">
              <p>قد نحدّث هذه السياسة عند تغيير المنصة أو ممارساتها. وستُنشر أحدث نسخة وتاريخ سريانها على هذه الصفحة.</p>
            </Section>
          </article>
        </div>
      </div>
    </main>
  );
}
