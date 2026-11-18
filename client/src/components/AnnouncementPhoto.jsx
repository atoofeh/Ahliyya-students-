import { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useToast } from '../hooks/useToast';
import { Button } from './ui';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function AnnouncementPhoto({ file, onChange, disabled }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setPreview({ file, url }), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);

  const choose = (event) => {
    const photo = event.target.files?.[0];
    event.target.value = '';
    if (!photo) return;
    if (!PHOTO_TYPES.includes(photo.type) || photo.size > 10 * 1024 * 1024) {
      toast.error(t('ann.photoTypes'));
      return;
    }
    onChange(photo);
  };

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-200">
        <ImagePlus size={16} aria-hidden="true" />
        {t('ann.addPhoto')}
        <input type="file" accept={PHOTO_TYPES.join(',')} disabled={disabled} onChange={choose} className="min-w-0 flex-1 text-xs" aria-label={t('ann.addPhoto')} />
      </label>
      <p className="text-xs text-surface-400">{t('ann.photoTypes')}</p>
      {file && (
        <div className="space-y-2 rounded-xl border border-surface-200 p-2 dark:border-surface-700">
          {preview?.file === file && <img src={preview.url} alt={t('ann.photoPreview')} className="max-h-56 w-full rounded-lg object-contain" />}
          <div className="flex items-center justify-between gap-2">
            <span dir="auto" className="truncate text-xs text-surface-500">{file.name}</span>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
              <X size={14} aria-hidden="true" /> {t('ann.removePhoto')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
