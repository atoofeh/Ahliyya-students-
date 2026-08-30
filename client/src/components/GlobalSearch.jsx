import { useEffect, useRef, useState } from 'react';
import { Search, BookOpen, FileText, HelpCircle, Video, Users, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isAdminRole } from '../utils/roles';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const GROUPS = [
  { key: 'courses', label: 'Courses', icon: <BookOpen size={14} /> },
  { key: 'lessons', label: 'Lessons', icon: <FileText size={14} /> },
  { key: 'quizzes', label: 'Quizzes', icon: <HelpCircle size={14} /> },
  { key: 'videos', label: 'Videos', icon: <Video size={14} /> },
  { key: 'assignments', label: 'Assignments', icon: <ClipboardList size={14} /> },
  { key: 'users', label: 'People', icon: <Users size={14} /> },
];

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onChange = (value) => {
    setQ(value);
    clearTimeout(timer.current);
    if (value.trim().length < 2) { setResults(null); return; }
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q: value.trim() } });
        setResults(data);
        setOpen(true);
      } catch { setResults(null); }
    }, 300);
  };

  const goto = (group, item) => {
    setOpen(false); setQ('');
    const courseId = item.course?._id || item.course || item._id;
    if (group === 'courses') {
      navigate(user.role === 'student' ? `/student/courses/${item._id}` : user.role === 'teacher' ? `/teacher/courses/${item._id}` : `/admin/courses`);
    } else if (group === 'users') {
      navigate(isAdminRole(user.role) ? '/admin/users' : '#');
    } else {
      navigate(user.role === 'student' ? `/student/courses/${courseId}` : `/teacher/courses/${courseId}`);
    }
  };

  const hasResults = results && GROUPS.some((g) => results[g.key]?.length);

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder="Search courses, lessons, quizzes..."
        className="w-full rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 py-2 pl-9 pr-3 text-sm text-surface-800 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {open && (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-xl animate-fade-in max-h-96 overflow-y-auto">
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-surface-400">No results for “{q}”</p>
          ) : GROUPS.map((g) => results[g.key]?.length ? (
            <div key={g.key}>
              <div className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-surface-400">
                {g.icon} {g.label}
              </div>
              {results[g.key].map((item) => (
                <button key={item._id} onClick={() => goto(g.key, item)}
                  className="block w-full px-4 py-2 text-left text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/50">
                  {item.title || item.name}
                  {item.username && <span className="ml-2 text-xs text-surface-400">@{item.username}</span>}
                  {item.teacher?.name && <span className="ml-2 text-xs text-surface-400">by {item.teacher.name}</span>}
                </button>
              ))}
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}
