import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Download, BookOpenCheck, Plus, Pencil, Trash2, Upload, Wifi, ListChecks, EyeOff } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { downloadFile } from '../api/download';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useConfirm } from '../hooks/useConfirm';
import { isAdminRole } from '../utils/roles';
import { Card, Button, Modal, Input, EmptyState, PageIntro, ProgressBar } from '../components/ui';
import { SkeletonCard } from '../components/Skeletons';
import ErrorState from '../components/ErrorState';
import PdfReader from '../components/PdfReader';
import PracticeQuiz from '../components/PracticeQuiz';
import PracticeEditor from '../components/PracticeEditor';

const MB = 1048576;
const BIG = 15 * MB;
const fmtSize = (b) => (b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** A refusal read from a binary response: the body is JSON, just not parsed. */
const readError = (err) => {
  const body = err?.response?.data;
  if (body instanceof ArrayBuffer) {
    try { return JSON.parse(new TextDecoder().decode(body)).message || apiError(err); } catch { /* not JSON */ }
  }
  return apiError(err);
};

/**
 * One colour per subject, picked from the brand palette by the subject's name
 * so the same subject always wears the same colour across visits.
 */
const SPINES = [
  'from-brand-600 to-brand-800 text-white',
  'from-gold-400 to-gold-600 text-brand-950',
  'from-emerald-500 to-emerald-700 text-white',
  'from-sky-500 to-sky-700 text-white',
  'from-rose-500 to-rose-700 text-white',
];
const spineFor = (subject = '') => {
  let h = 0;
  for (const ch of subject) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return SPINES[h % SPINES.length];
};

/**
 * Past questions — answer papers from earlier exams, for the استدراكي.
 *
 * Laid out as a shelf rather than a grid of cards: each paper is one line you
 * can read at a glance — its subject, its title, how big it is — with Open
 * right beside it. A paper opens in the app's own reader, on the web and on
 * the phone alike.
 *
 * Students read papers; they do not keep them. The reader has no save or
 * print control, the server refuses a student the download form of the file,
 * and a student's pages carry the platform watermark. Staff keep a Download
 * button. Administrators curate the shelf from the same page.
 */
export default function PastPapersPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const canManage = isAdminRole(user?.role);
  const canDownload = user?.role !== 'student';

  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({}); // id → 0..1 while fetching
  const [viewing, setViewing] = useState(null); // { paper, data, watermark }
  const [editor, setEditor] = useState(null); // null | {} (new) | paper
  const [practiceFor, setPracticeFor] = useState(null); // paper id, practising
  const [questionsFor, setQuestionsFor] = useState(null); // paper, writing questions
  const [form, setForm] = useState({ title: '', subject: '', file: null });
  const [upload, setUpload] = useState(null); // 0..1 while uploading
  const fileInput = useRef(null);
  const watermarkRef = useRef(undefined); // fetched once, on the first paper opened

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/past-papers');
      setError(null);
      setItems(data.items);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, []);
  useEffect(() => { const t0 = setTimeout(load, 0); return () => clearTimeout(t0); }, [load]);

  const track = (id) => (f) => setProgress((p) => ({ ...p, [id]: f }));
  const done = (id) => setProgress((p) => { const n = { ...p }; delete n[id]; return n; });
  const fileName = (paper) => `${paper.title || 'paper'}.pdf`;

  // A student's pages carry the same mark as their videos, when the platform
  // has it switched on. If it cannot be fetched the paper still opens; the
  // failure is not remembered, so the next paper asks again.
  const watermarkLines = async () => {
    if (canDownload) return null;
    if (watermarkRef.current !== undefined) return watermarkRef.current;
    try {
      const { data } = await api.get('/videos/watermark/me');
      watermarkRef.current = data.enabled ? data.lines : null;
      return watermarkRef.current;
    } catch { return null; }
  };

  const open = async (paper) => {
    track(paper._id)(0);
    try {
      const [{ data }, watermark] = await Promise.all([
        api.get(`/files/${paper._id}/content`, {
          responseType: 'arraybuffer',
          onDownloadProgress: (e) => { if (e.total) track(paper._id)(e.loaded / e.total); },
        }),
        watermarkLines(),
      ]);
      setViewing({ paper, data, watermark });
    } catch (err) { toast.error(readError(err)); }
    finally { done(paper._id); }
  };
  const closeReader = useCallback(() => setViewing(null), []);

  const download = async (paper) => {
    track(paper._id)(0);
    try { await downloadFile(paper._id, fileName(paper), { onProgress: track(paper._id) }); }
    catch (err) { toast.error(apiError(err)); }
    finally { done(paper._id); }
  };

  const openEditor = (paper) => {
    setForm({ title: paper?.title || '', subject: paper?.subject || '', file: null });
    setEditor(paper || {});
  };

  const save = async () => {
    try {
      if (editor._id) {
        await api.patch(`/past-papers/${editor._id}`, { title: form.title.trim(), subject: form.subject.trim() });
        toast.success(t('pp.saved'));
      } else {
        const body = new FormData();
        body.append('file', form.file);
        if (form.title.trim()) body.append('title', form.title.trim());
        if (form.subject.trim()) body.append('subject', form.subject.trim());
        setUpload(0);
        await api.post('/past-papers', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => { if (e.total) setUpload(e.loaded / e.total); },
        });
        toast.success(t('pp.added'));
      }
      setEditor(null);
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setUpload(null); }
  };

  const remove = async (paper) => {
    if (!(await confirm(t('pp.confirmDelete', { title: paper.title })))) return;
    try { await api.delete(`/past-papers/${paper._id}`); toast.success(t('pp.removed')); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!items) return <div className="space-y-3"><SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} /></div>;

  const pct = (f) => Math.round((f || 0) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageIntro
        title={t('pp.title')}
        subtitle={t('pp.subtitle')}
        actions={canManage ? <Button onClick={() => openEditor(null)}><Plus size={15} /> {t('pp.add')}</Button> : undefined}
      />

      <p className="inline-flex items-center gap-2 rounded-full bg-gold-50 px-3.5 py-1.5 text-[13px] font-semibold text-gold-700 ring-1 ring-inset ring-gold-200 dark:bg-gold-900/20 dark:text-gold-300 dark:ring-gold-700/40">
        <BookOpenCheck size={15} aria-hidden="true" /> {t('pp.forMakeup')}
      </p>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={26} />} title={t('pp.empty')}
            subtitle={t(canManage ? 'pp.emptyAdminHint' : 'pp.emptyHint')} />
        </Card>
      ) : (
        <Card className="divide-y divide-surface-100 overflow-hidden dark:divide-surface-700/60">
          {items.map((paper) => {
            const busy = progress[paper._id] !== undefined;
            const practising = practiceFor === paper._id;
            const hasPractice = paper.practiceCount > 0 && (paper.practicePublished || canManage);
            return (
              <div key={paper._id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:flex-nowrap">
                {/* The spine: the subject's colour, so papers are told apart before they are read. */}
                <span className={`flex h-14 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-gradient-to-b shadow-card ${spineFor(paper.subject || paper.title)}`}>
                  <FileText size={18} aria-hidden="true" />
                  <span className="mt-0.5 text-[9px] font-bold tracking-wide">PDF</span>
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-bold leading-snug text-surface-900 dark:text-white">
                    <span className="bidi-isolate">{paper.title || paper.originalName}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-surface-400">
                    {paper.subject && <span className="bidi-isolate font-medium text-surface-500 dark:text-surface-300">{paper.subject}</span>}
                    {paper.subject && <span aria-hidden="true">·</span>}
                    <span dir="ltr">{t('pp.pdfSize', { size: fmtSize(paper.sizeBytes) })}</span>
                    {paper.sizeBytes > BIG && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Wifi size={11} aria-hidden="true" /> {t('pp.bigFile')}
                      </span>
                    )}
                  </p>
                  {busy && (
                    <div className="mt-2 flex items-center gap-2" role="status">
                      <ProgressBar value={pct(progress[paper._id])} className="h-1.5 max-w-[220px]" />
                      <span className="text-[11px] tabular-nums text-surface-400">{t('pp.loading', { pct: pct(progress[paper._id]) })}</span>
                    </div>
                  )}
                </div>

                <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
                  <Button className="flex-1 sm:flex-none" disabled={busy} onClick={() => open(paper)}>{t('pp.open')}</Button>
                  {canDownload && (
                    <Button variant="outline" disabled={busy} onClick={() => download(paper)} aria-label={t('pp.download')} title={t('pp.download')}>
                      <Download size={15} />
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setQuestionsFor(paper)} aria-label={t('pp.practiceManage')} title={t('pp.practiceManage')}>
                        <ListChecks size={14} />
                      </Button>
                      <Button variant="ghost" onClick={() => openEditor(paper)} aria-label={t('pp.edit')} title={t('pp.edit')}><Pencil size={14} /></Button>
                      <Button variant="ghost" onClick={() => remove(paper)} aria-label={t('pp.delete')} title={t('pp.delete')}><Trash2 size={14} className="text-rose-400" /></Button>
                    </>
                  )}
                </div>
              </div>

              {/* Practice sits under the paper it came from: read it, then try it. */}
              {hasPractice && (
                <div className="border-t border-surface-100 bg-surface-50/70 dark:border-surface-700/60 dark:bg-surface-800/30">
                  {practising ? (
                    <PracticeQuiz paperId={paper._id} onClose={() => setPracticeFor(null)} />
                  ) : (
                    <button type="button" onClick={() => setPracticeFor(paper._id)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-[13px] font-semibold text-brand-700 transition-colors hover:bg-surface-100 dark:text-brand-300 dark:hover:bg-surface-800/60">
                      <ListChecks size={15} aria-hidden="true" />
                      {t('pp.practiceStart', { n: paper.practiceCount })}
                      {!paper.practicePublished && (
                        <span className="ms-auto inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <EyeOff size={11} aria-hidden="true" /> {t('pp.practiceHidden')}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Reading a paper: full screen, drawn by the app itself. */}
      {viewing && (
        <PdfReader key={viewing.paper._id} data={viewing.data} watermark={viewing.watermark}
          title={viewing.paper.title || viewing.paper.originalName} readOnly={!canDownload} onClose={closeReader} />
      )}

      {/* Writing the practice questions that sit under a paper. */}
      {questionsFor && (
        <PracticeEditor paper={questionsFor} onClose={() => setQuestionsFor(null)} onChanged={load} />
      )}

      {/* Adding or renaming a paper. */}
      <Modal open={!!editor} onClose={() => upload === null && setEditor(null)} title={t(editor?._id ? 'pp.edit' : 'pp.addTitle')}>
        <div className="space-y-4">
          {!editor?._id && (
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-surface-700 dark:text-surface-200">{t('pp.fileField')}</span>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))} />
              <Button variant="outline" className="w-full justify-center" onClick={() => fileInput.current?.click()} disabled={upload !== null}>
                <Upload size={15} />
                <span dir="auto" className="truncate">
                  {form.file ? `${form.file.name} · ${fmtSize(form.file.size)}` : t('pp.chooseFile')}
                </span>
              </Button>
            </div>
          )}
          <Input label={t('pp.titleField')} dir="auto" value={form.title} hint={editor?._id ? undefined : t('pp.titleHint')}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Input label={t('pp.subjectField')} dir="auto" value={form.subject} placeholder={t('pp.subjectPlaceholder')}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          {upload !== null && (
            <div className="flex items-center gap-2" role="status">
              <ProgressBar value={pct(upload)} className="h-1.5" />
              <span className="shrink-0 text-xs tabular-nums text-surface-500">{t('pp.uploading', { pct: pct(upload) })}</span>
            </div>
          )}
          <Button className="w-full" loading={upload !== null} onClick={save}
            disabled={editor?._id ? !form.title.trim() : !form.file}>
            {t(editor?._id ? 'pp.save' : 'pp.upload')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
