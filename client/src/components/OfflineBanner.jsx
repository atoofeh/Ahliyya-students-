import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/** Slim, persistent bar while the browser reports no connection. */
export default function OfflineBanner() {
  const { online } = useNetworkStatus();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-[13px] font-semibold text-amber-950">
      <WifiOff size={14} /> You are offline — changes are kept on this device and sent when you reconnect.
    </div>
  );
}
