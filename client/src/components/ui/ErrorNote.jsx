import { AlertCircle } from 'lucide-react';

export function ErrorNote({ error, className = '' }) {
  if (!error) return null;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger ${className}`}>
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{error.message ?? String(error)}</span>
    </div>
  );
}
