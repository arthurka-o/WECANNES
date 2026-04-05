export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatStatus(status: string) {
  const map: Record<string, string> = {
    PendingReview: 'In Review',
  };
  return map[status] ?? status;
}
