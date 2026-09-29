export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="empty">
      <p>{message}</p>
      <button type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
