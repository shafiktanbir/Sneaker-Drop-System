export function formatZodError(err) {
  if (err?.issues) {
    const first = err.issues[0];
    return first ? `${first.path.join('.')}: ${first.message}` : err.message;
  }
  return err?.message ?? 'Validation failed';
}
