import { useEffect, useState } from 'react';
import { Award, BadgeCheck, CalendarDays } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, EmptyState, PageIntro, Badge } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import { LogoMark } from '../../components/Logo';

export default function CertificatesPage() {
  const [certs, setCerts] = useState(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    api.get('/enrollments/certificates/mine').then(({ data }) => setCerts(data)).catch(() => setCerts([]));
  }, []);

  if (!certs) return <SkeletonCard />;

  return (
    <div className="space-y-5">
      <PageIntro title={t('certs.title')} subtitle={t('certs.subtitle')} />
      {certs.length === 0 ? (
        <Card><EmptyState icon={<Award size={28} />} title={t('certs.empty')}
          subtitle={t('certs.emptyHint')} /></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {certs.map((c) => (
            <div key={c._id} className="group relative overflow-hidden rounded-2xl bg-brand-gradient p-1.5 shadow-float transition-shadow duration-200 hover:shadow-glow">
              {/* Inner parchment */}
              <div className="relative rounded-xl border border-gold-400/40 bg-white p-6 dark:bg-surface-900">
                {/* Corner flourishes */}
                <span className="pointer-events-none absolute start-2.5 top-2.5 h-5 w-5 rounded-ss-lg border-s-2 border-t-2 border-gold-400/70" />
                <span className="pointer-events-none absolute end-2.5 top-2.5 h-5 w-5 rounded-se-lg border-e-2 border-t-2 border-gold-400/70" />
                <span className="pointer-events-none absolute bottom-2.5 start-2.5 h-5 w-5 rounded-es-lg border-b-2 border-s-2 border-gold-400/70" />
                <span className="pointer-events-none absolute bottom-2.5 end-2.5 h-5 w-5 rounded-ee-lg border-b-2 border-e-2 border-gold-400/70" />

                <div className="flex items-start justify-between gap-3">
                  <LogoMark size={38} />
                  {/* Gold seal */}
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow ring-4 ring-gold-200/50 dark:ring-gold-700/30">
                    <Award size={22} className="text-brand-950" />
                  </span>
                </div>

                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-gold-600 dark:text-gold-400">
                  {t('certs.ofCompletion')}
                </p>
                <h3 dir="auto" className="mt-1.5 font-display text-lg font-extrabold leading-snug text-surface-900 dark:text-white">
                  {c.course?.title}
                </h3>
                <p className="mt-1 text-sm text-surface-500">
                  {t('certs.awardedTo')} <span className="font-semibold text-surface-800 dark:text-surface-100">{user?.name}</span>
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-dashed border-surface-200 pt-3.5 text-xs text-surface-400 dark:border-surface-700">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={13} /> {new Date(c.issuedAt).toLocaleDateString()}
                  </span>
                  {c.finalScore != null && <Badge color="gold">{t('certs.finalAverage', { n: c.finalScore })}</Badge>}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-surface-400">
                  <BadgeCheck size={13} className="shrink-0 text-emerald-500" />
                  <span className="truncate">
                    {t('certs.serial')} <span className="font-mono font-semibold text-surface-600 dark:text-surface-300">{c.serial}</span>
                    {' · '}{t('certs.verifyAt')} <span dir="ltr" className="font-mono">/enrollments/certificates/verify/{c.serial}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
