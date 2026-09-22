import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, KeyRound, PlayCircle, Timer, BookOpenCheck, GraduationCap, Newspaper,
  Smartphone, Eye, Check, X, ArrowRight, ArrowLeft, Play, Award, Bell,
} from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { pushBackHandler } from '../app/shell';
import { SOCIAL } from '../utils/social';
import SocialLinks from './SocialLinks';
import LanguageToggle from './LanguageToggle';

/* ── Vignettes ───────────────────────────────────────────────────────
 * Small, faithful replicas of the control each step talks about, so a new
 * student recognises it when they meet it — not illustrations of it.
 */

function Frame({ children }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800/60">
      {children}
    </div>
  );
}

function HomeVignette({ t }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-brand-gradient p-3 text-white shadow-card">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-brand-950">
        <Play size={15} className="ms-0.5 fill-current rtl:rotate-180" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-gold-300">{t('student.continueLearning')}</span>
        <span className="block h-2 w-32 rounded bg-white/70" />
        <span className="mt-1 block h-1.5 w-20 rounded bg-white/30" />
      </span>
    </div>
  );
}

function JoinVignette({ t }) {
  return (
    <Frame>
      <span className="mb-1.5 block text-[11px] font-semibold text-surface-500">{t('student.accessCode')}</span>
      <div className="flex gap-2">
        <span dir="ltr" className="flex-1 rounded-lg border border-surface-300 bg-white px-3 py-2 font-mono text-sm tracking-wider text-surface-700 dark:border-surface-600 dark:bg-surface-900 dark:text-surface-200">
          7KQ2-M9XD-4P
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white">
          <KeyRound size={13} aria-hidden="true" /> {t('student.enrol')}
        </span>
      </div>
    </Frame>
  );
}

function VideoVignette({ t }) {
  const { user } = useAuth();
  return (
    <div className="space-y-2">
      <div className="relative flex aspect-[16/7] items-center justify-center rounded-xl bg-surface-900">
        <PlayCircle size={34} className="text-white/80" aria-hidden="true" />
        <span dir="auto" className="absolute end-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/60">{user?.name}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-surface-100 px-3 py-2 text-xs text-surface-600 dark:bg-surface-800 dark:text-surface-300">
        <Eye size={13} aria-hidden="true" />
        <span className="bidi-isolate font-semibold">{t('video.viewsLeft', { count: 3, limit: 4 })}</span>
      </div>
    </div>
  );
}

function QuizVignette({ t }) {
  return (
    <Frame>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-surface-500">{t('quiz.question', { n: 3, total: 20 })}</span>
        <span dir="ltr" className="inline-flex items-center gap-1.5 rounded-lg bg-surface-200/70 px-2.5 py-1 font-mono text-xs font-bold text-surface-700 dark:bg-surface-700 dark:text-surface-200">
          <Timer size={13} aria-hidden="true" /> 00:43:34
        </span>
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <Check size={12} aria-hidden="true" /> {t('quiz.saved')}
      </span>
    </Frame>
  );
}

function PapersVignette({ t }) {
  const shelf = [
    ['from-brand-600 to-brand-800', 'أجوبة عربي استدراكي'],
    ['from-sky-500 to-sky-700', 'أجوبة انجليزي استدراكي'],
    ['from-emerald-500 to-emerald-700', 'أجوبة حاسوب استدراكي'],
  ];
  return (
    <Frame>
      <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gold-700 dark:text-gold-300">
        <BookOpenCheck size={13} aria-hidden="true" /> {t('pp.forMakeup')}
      </span>
      <ul className="space-y-1.5">
        {shelf.map(([tone, title]) => (
          <li key={title} className="flex items-center gap-2.5">
            <span className={`h-7 w-5 shrink-0 rounded-sm bg-gradient-to-b ${tone}`} />
            <span dir="rtl" className="flex-1 truncate text-[13px] font-semibold text-surface-700 dark:text-surface-200">{title}</span>
            <span className="rounded-md bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">{t('pp.open')}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function ResultsVignette({ t }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Frame>
        <GraduationCap size={16} className="mb-1 text-brand-500" aria-hidden="true" />
        <span className="block text-[11px] text-surface-500">{t('nav.grades')}</span>
        <span className="font-display text-lg font-extrabold text-emerald-600">86%</span>
      </Frame>
      <Frame>
        <Award size={16} className="mb-1 text-gold-500" aria-hidden="true" />
        <span className="block text-[11px] text-surface-500">{t('nav.certificates')}</span>
        <span className="mt-1 block h-2 w-16 rounded bg-gold-300/70" />
      </Frame>
    </div>
  );
}

function NewsVignette({ t }) {
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-surface-200 dark:bg-surface-900 dark:ring-surface-700">
          <Bell size={16} className="text-surface-600 dark:text-surface-300" aria-hidden="true" />
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">2</span>
        </span>
        <span className="text-xs text-surface-600 dark:text-surface-300">{t('auth.keepSignedIn')}</span>
        <span className="ms-auto flex h-5 w-9 items-center rounded-full bg-brand-600 px-0.5">
          <span className="ms-auto h-4 w-4 rounded-full bg-white" />
        </span>
      </div>
    </Frame>
  );
}

function AccountVignette() {
  // The real control, not a picture of it: a student can switch right here.
  return (
    <Frame>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs text-surface-600 dark:text-surface-300">
          <Smartphone size={15} aria-hidden="true" /> 1 / 1
        </span>
        <LanguageToggle />
      </div>
    </Frame>
  );
}

/* ── Steps ─────────────────────────────────────────────────────────── */

const STEPS = [
  { key: 'welcome', Icon: null },
  { key: 'home', Icon: LayoutDashboard, Vignette: HomeVignette },
  { key: 'join', Icon: KeyRound, Vignette: JoinVignette },
  { key: 'videos', Icon: PlayCircle, Vignette: VideoVignette },
  { key: 'quizzes', Icon: Timer, Vignette: QuizVignette },
  { key: 'papers', Icon: BookOpenCheck, Vignette: PapersVignette },
  { key: 'results', Icon: GraduationCap, Vignette: ResultsVignette },
  { key: 'news', Icon: Newspaper, Vignette: NewsVignette },
  { key: 'account', Icon: Smartphone, Vignette: AccountVignette },
  { key: 'follow', Icon: null, social: true },
];

function Stage({ step }) {
  // The ask screen and the welcome step carry the institute's mark; the
  // follow step carries the platforms themselves; the rest, the step's icon.
  let art;
  if (!step || step.key === 'welcome') {
    art = <img src="/logo-mark-white.png" alt="" aria-hidden="true" className="w-24 drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]" />;
  } else if (step.social) {
    art = (
      <div className="flex flex-wrap justify-center gap-2" aria-hidden="true">
        {SOCIAL.map(({ key, icon }) => (
          <span key={key} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d={icon.path} fill="#fff" /></svg>
          </span>
        ))}
      </div>
    );
  } else {
    const { Icon } = step;
    art = (
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-2 ring-gold-400/70 ring-offset-4 ring-offset-transparent">
        <Icon size={34} className="text-gold-300" aria-hidden="true" />
      </span>
    );
  }
  return (
    <div className="relative flex h-40 shrink-0 items-center justify-center overflow-hidden bg-brand-gradient sm:h-44">
      <span className="pointer-events-none absolute -start-10 -top-12 h-40 w-40 rounded-full border border-white/10" />
      <span className="pointer-events-none absolute -bottom-16 -end-8 h-44 w-44 rounded-full border border-gold-400/15" />
      <div key={step?.key || 'ask'} className="relative animate-scale-in">{art}</div>
    </div>
  );
}

/**
 * The welcome tour.
 *
 * Opens once for a new student account with a single question — are you new
 * here? — so a returning student who simply got a new phone is not marched
 * through it. "Yes" walks through the app a step at a time; "No" ends it.
 * Either way the answer is stored on the account, so it is asked exactly once.
 * The help button in the header replays it at any time, straight from the
 * first step.
 *
 * Every step is two or three sentences and, where it helps, a small replica
 * of the real control — so the lesson is "this is what it looks like", not a
 * paragraph to remember. The last step is the institute's social accounts,
 * offered, not pressed.
 */
export default function StudentTour({ mode = 'ask', onClose }) {
  const { t } = useLanguage();
  const { user, setUser } = useAuth();
  const [index, setIndex] = useState(mode === 'ask' ? -1 : 0); // -1 = the question
  const panelRef = useRef(null);

  const finish = async (outcome) => {
    onClose();
    if (mode !== 'ask' || user?.tourCompletedAt) return;
    try {
      const { data } = await api.post('/auth/tour', { outcome });
      setUser((u) => (u ? { ...u, tourCompletedAt: data.tourCompletedAt } : u));
    } catch { /* offline: it will simply ask again next time */ }
  };

  useFocusTrap(panelRef, { active: true, onEscape: () => finish(index < 0 ? 'declined' : 'skipped') });

  // Android back steps backwards through the tour, and only closes it from the
  // first screen. The handler is registered once; it reads the live step and
  // the live finish() through a ref, refreshed after every render.
  const backRef = useRef(null);
  useEffect(() => {
    backRef.current = () => {
      if (index > 0) setIndex(index - 1);
      else finish(index < 0 ? 'declined' : 'skipped');
    };
  });
  useEffect(() => pushBackHandler(() => backRef.current?.()), []);

  const step = index >= 0 ? STEPS[index] : null;
  const last = index === STEPS.length - 1;
  const titleId = 'student-tour-title';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-brand-950/70 backdrop-blur-sm animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pb-safe relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-float animate-slide-up dark:bg-surface-900 sm:max-w-md sm:rounded-3xl"
      >
        <Stage step={step} />

        {index >= 0 && (
          <button
            type="button"
            onClick={() => finish('skipped')}
            className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            {t('tour.skip')} <X size={13} aria-hidden="true" />
          </button>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-2 pt-6">
          {index < 0 ? (
            <div key="ask" className="animate-fade-in">
              <h2 id={titleId} className="font-display text-xl font-extrabold text-surface-900 dark:text-white" style={{ textWrap: 'balance' }}>
                {t('tour.askTitle')}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-surface-600 dark:text-surface-300" style={{ textWrap: 'pretty' }}>
                {t('tour.askBody')}
              </p>
            </div>
          ) : (
            <div key={step.key} className="animate-slide-up">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-600 dark:text-gold-400">
                {t('tour.stepOf', { n: index + 1, total: STEPS.length })}
              </p>
              <h2 id={titleId} className="font-display text-xl font-extrabold text-surface-900 dark:text-white" style={{ textWrap: 'balance' }}>
                {t(`tour.${step.key}.title`)}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-surface-600 dark:text-surface-300" style={{ textWrap: 'pretty' }}>
                {t(`tour.${step.key}.body`)}
              </p>
              {step.Vignette && <div className="mt-4"><step.Vignette t={t} /></div>}
              {step.social && <SocialLinks variant="grid" className="mt-4" />}
            </div>
          )}
        </div>

        <div className="border-t border-surface-100 px-6 py-4 dark:border-surface-800">
          {index < 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIndex(0)}
                className="rounded-xl bg-brand-600 px-4 py-3 text-[15px] font-semibold text-white shadow-card transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                {t('tour.yesNew')}
              </button>
              <button
                type="button"
                onClick={() => finish('declined')}
                className="rounded-xl px-4 py-3 text-[15px] font-semibold text-surface-600 transition-colors hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-surface-300 dark:hover:bg-surface-800"
              >
                {t('tour.notNew')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Progress, as dots: where you are, and how much is left. */}
              <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
                {STEPS.map((s, i) => (
                  <span
                    key={s.key}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === index ? 'w-5 bg-brand-600' : i < index ? 'w-1.5 bg-brand-300' : 'w-1.5 bg-surface-200 dark:bg-surface-700'
                    }`}
                  />
                ))}
              </div>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setIndex((i) => i - 1)}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-surface-600 hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-surface-300 dark:hover:bg-surface-800"
                >
                  <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" /> {t('tour.back')}
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? finish('completed') : setIndex((i) => i + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                {last ? t('tour.finish') : t('tour.next')}
                {!last && <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
