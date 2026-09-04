import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handshake, Check, X } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, EmptyState, PageIntro } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

/** Co-teaching invitations addressed to the signed-in teacher. */
export default function TeacherInvitations() {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get('/co-teaching/invitations');
    setItems(data.items);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load().catch((err) => toast.error(apiError(err))), 0);
    return () => clearTimeout(t);
  }, [load, toast]);

  const respond = async (invite, answer) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/co-teaching/invitations/${invite._id}/${answer}`);
      if (answer === 'accept') {
        toast.success(`You now co-teach ${invite.course?.title}`);
        navigate(`/teacher/courses/${data.course}`);
        return;
      }
      toast.success('Invitation declined');
      await load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageIntro
        title="Co-teaching invitations"
        subtitle="Accepting gives you the same authority over the course as the teacher who created it."
      />
      {!items ? <SkeletonCard /> : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Handshake size={26} />}
            title="No invitations right now"
            subtitle="When another teacher invites you onto their course, it appears here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((inv) => (
            <Card key={inv._id} className="p-5">
              <p className="font-display text-lg font-bold text-surface-900 dark:text-white">{inv.course?.title}</p>
              <p className="mt-0.5 text-sm text-surface-500">
                {inv.invitedBy?.name} invited you on {new Date(inv.createdAt).toLocaleDateString()}
                {inv.course?.category ? ` · ${inv.course.category}` : ''}
              </p>
              {inv.message && (
                <p className="mt-3 rounded-xl bg-surface-50 p-3 text-sm text-surface-700 dark:bg-surface-700/40 dark:text-surface-200">
                  “{inv.message}”
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => respond(inv, 'accept')}>
                  <Check size={15} /> Accept and start teaching
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => respond(inv, 'decline')}>
                  <X size={15} /> Decline
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
